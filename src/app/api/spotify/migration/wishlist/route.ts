import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotifyTracks, spotifyPlaylists, spotifyPlaylistTracks, wishList } from "@/lib/db/schema";
import { inArray, eq, sql } from "drizzle-orm";

/**
 * POST /api/spotify/migration/wishlist
 *
 * Body: { trackIds: number[] }  — spotify_tracks.id values to put on the
 *                                wishlist as type="spotify_missing".
 *
 * - Only inserts tracks that are actually unmatched (local_track_id IS NULL).
 *   Anything already-local is silently skipped — the wizard's review step
 *   shouldn't have shown them, but defence in depth.
 * - Idempotent: if a wish_list row already exists with the same
 *   spotify_track_id, it's left alone (no duplicate insert).
 * - Each new row gets a JSON-encoded `spotifyPlaylistNames` so the
 *   /wishlist UI can show which playlists the track came from.
 *
 * Returns { added: number, skipped: number, alreadyMatched: number }.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const trackIds: unknown = body?.trackIds;

  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return NextResponse.json({ error: "trackIds[] required" }, { status: 400 });
  }

  const ids = trackIds
    .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
    .filter((n) => Number.isFinite(n));

  if (ids.length === 0) {
    return NextResponse.json({ error: "no valid track IDs" }, { status: 400 });
  }

  // Pull only unmatched rows; alreadyMatched count is the rest.
  const rows = db
    .select()
    .from(spotifyTracks)
    .where(inArray(spotifyTracks.id, ids))
    .all();

  const unmatched = rows.filter((r) => r.localTrackId == null);
  const alreadyMatched = rows.length - unmatched.length;

  // Existing wishlist entries — skip duplicates.
  const existing = unmatched.length
    ? db
        .select({ spotifyTrackId: wishList.spotifyTrackId })
        .from(wishList)
        .where(inArray(wishList.spotifyTrackId, unmatched.map((r) => r.id)))
        .all()
    : [];
  const existingIds = new Set(existing.map((e) => e.spotifyTrackId));

  let added = 0;
  let skipped = alreadyMatched;
  for (const t of unmatched) {
    if (existingIds.has(t.id)) {
      skipped++;
      continue;
    }
    // Resolve playlist names for this track.
    const plRows = db
      .select({ name: spotifyPlaylists.name })
      .from(spotifyPlaylistTracks)
      .innerJoin(spotifyPlaylists, eq(spotifyPlaylists.id, spotifyPlaylistTracks.spotifyPlaylistId))
      .where(eq(spotifyPlaylistTracks.spotifyTrackId, t.id))
      .all();
    const playlistNames = plRows.map((r) => r.name);

    db.insert(wishList)
      .values({
        type: "spotify_missing",
        seedTitle: t.title,
        seedArtist: t.artist,
        seedAlbum: t.album,
        spotifyTrackId: t.id,
        spotifyUri: t.spotifyUri,
        isrc: t.isrc,
        coverUrl: t.coverUrl,
        spotifyPlaylistNames: JSON.stringify(playlistNames),
        popularity: t.popularity,
        status: "pending",
      })
      .run();
    added++;
  }

  return NextResponse.json({ added, skipped, alreadyMatched });
}

// Keep sql import live (used for table-name macros if/when needed).
void sql;
