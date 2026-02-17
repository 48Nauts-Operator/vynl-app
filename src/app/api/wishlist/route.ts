import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wishList, spotifyTracks } from "@/lib/db/schema";
import { eq, desc, sql, inArray, isNull, isNotNull } from "drizzle-orm";

// One-time backfill: populate popularity from spotify_tracks for existing wishlist items
let backfilled = false;
function ensurePopularity() {
  if (backfilled) return;
  backfilled = true;
  try {
    db.run(sql`
      UPDATE wish_list SET popularity = (
        SELECT st.popularity FROM spotify_tracks st WHERE st.id = wish_list.spotify_track_id
      )
      WHERE wish_list.popularity IS NULL AND wish_list.spotify_track_id IS NOT NULL
    `);
  } catch { /* table might not have column yet on first load */ }
}

/** GET — list wishlist items with optional status filter */
export async function GET(request: NextRequest) {
  ensurePopularity();
  const status = request.nextUrl.searchParams.get("status");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "100", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);

  let query = db.select().from(wishList).orderBy(desc(wishList.createdAt));

  if (status) {
    query = query.where(eq(wishList.status, status)) as typeof query;
  }

  const items = query.limit(limit).offset(offset).all();
  const total = db.select({ count: sql<number>`COUNT(*)` }).from(wishList).get();

  return NextResponse.json({
    items,
    total: total?.count || 0,
    limit,
    offset,
  });
}

/** PATCH — update wishlist item(s)
 *  Supports single: { id, status } or { id, playlistNames }
 *  Supports batch:  { ids: number[], status }
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ids, status, playlistNames } = body;

  // Batch status update
  if (Array.isArray(ids) && ids.length > 0 && status) {
    db.update(wishList)
      .set({ status })
      .where(inArray(wishList.id, ids))
      .run();
    return NextResponse.json({ updated: ids.length });
  }

  // Single mode
  if (!id) {
    return NextResponse.json({ error: "id or ids required" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (status) updates.status = status;
  if (playlistNames !== undefined) updates.spotifyPlaylistNames = playlistNames;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  db.update(wishList)
    .set(updates)
    .where(eq(wishList.id, id))
    .run();

  return NextResponse.json({ updated: 1 });
}

/** DELETE — remove wishlist item(s)
 *  Single: ?id=123
 *  Batch:  JSON body { ids: number[] }
 */
export async function DELETE(request: NextRequest) {
  // Try batch mode from JSON body first
  try {
    const body = await request.json();
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      db.delete(wishList).where(inArray(wishList.id, body.ids)).run();
      return NextResponse.json({ deleted: body.ids.length });
    }
  } catch {
    // Not JSON body — fall through to query param
  }

  const id = parseInt(request.nextUrl.searchParams.get("id") || "0", 10);
  if (!id) {
    return NextResponse.json({ error: "id or ids required" }, { status: 400 });
  }

  db.delete(wishList).where(eq(wishList.id, id)).run();
  return NextResponse.json({ deleted: 1 });
}
