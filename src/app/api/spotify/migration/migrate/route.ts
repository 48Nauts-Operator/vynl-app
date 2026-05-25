import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotifyTracks } from "@/lib/db/schema";
import { inArray, isNull, and, sql } from "drizzle-orm";

/**
 * POST /api/spotify/migration/migrate
 *
 * Body: { trackIds: number[] }  — spotify_tracks.id values the user selected
 * Returns: {
 *   total: number,             // how many were submitted
 *   matched: number,           // already in local library (no action needed)
 *   missing: TrackRow[],       // not in local library — these are the
 *                              // candidates the wizard presents for wishlist/skip
 * }
 *
 * Matching was done at sync time (phase 5 in spotify-sync.ts). This endpoint
 * just queries which of the selected IDs have localTrackId IS NULL — no
 * re-running the matcher.
 */

interface MigrationMissingTrack {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  popularity: number | null;
  matchConfidence: number | null;
  playlistNames: string[];
}

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

  // Quick matched-count for the response summary.
  const matchedCountRow = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(spotifyTracks)
    .where(and(inArray(spotifyTracks.id, ids), sql`local_track_id IS NOT NULL`))
    .get();

  // Pull full missing rows (with playlist names) for the review table.
  interface Row {
    id: number;
    title: string;
    artist: string;
    album: string | null;
    coverUrl: string | null;
    popularity: number | null;
    matchConfidence: number | null;
    playlistNames: string | null;
  }
  const missingRows = db.all(sql`
    SELECT
      st.id              AS id,
      st.title           AS title,
      st.artist          AS artist,
      st.album           AS album,
      st.cover_url       AS coverUrl,
      st.popularity      AS popularity,
      st.match_confidence AS matchConfidence,
      (
        SELECT GROUP_CONCAT(DISTINCT sp2.name)
        FROM spotify_playlist_tracks spt2
        JOIN spotify_playlists sp2 ON sp2.id = spt2.spotify_playlist_id
        WHERE spt2.spotify_track_id = st.id
      )                  AS playlistNames
    FROM spotify_tracks st
    WHERE st.id IN ${ids} AND st.local_track_id IS NULL
    ORDER BY LOWER(st.artist), LOWER(st.title)
  `) as Row[];

  const missing: MigrationMissingTrack[] = missingRows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    coverUrl: r.coverUrl,
    popularity: r.popularity,
    matchConfidence: r.matchConfidence,
    playlistNames: r.playlistNames ? r.playlistNames.split(",") : [],
  }));

  return NextResponse.json({
    total: ids.length,
    matched: matchedCountRow?.n ?? 0,
    missing,
  });
}

// Used to keep `isNull` import live — drizzle tree-shaker complains otherwise.
void isNull;
