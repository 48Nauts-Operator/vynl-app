import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wishList } from "@/lib/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";

/** GET — list wishlist items with optional status filter */
export async function GET(request: NextRequest) {
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

/** PATCH — update wishlist item status (dismiss, etc.)
 *  Supports single: { id, status }
 *  Supports batch:  { ids: number[], status }
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ids, status } = body;

  if (!status) {
    return NextResponse.json({ error: "status required" }, { status: 400 });
  }

  // Batch mode
  if (Array.isArray(ids) && ids.length > 0) {
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

  db.update(wishList)
    .set({ status })
    .where(eq(wishList.id, id))
    .run();

  return NextResponse.json({ updated: 1 });
}

/** DELETE — remove a wishlist item */
export async function DELETE(request: NextRequest) {
  const id = parseInt(request.nextUrl.searchParams.get("id") || "0", 10);
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  db.delete(wishList).where(eq(wishList.id, id)).run();
  return NextResponse.json({ deleted: true });
}
