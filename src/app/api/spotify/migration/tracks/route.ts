import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotifySnapshots } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

/**
 * GET /api/spotify/migration/tracks
 *
 * Query params:
 *   playlistId  — numeric spotify_playlists.id, or "liked" for the liked-songs view,
 *                 or omitted for "all tracks across all playlists + liked"
 *   sort        — "title" | "artist" | "album" | "popularity" (default "artist")
 *   dedupe      — "1" to collapse rows with the same (normalised artist + title)
 *   limit       — page size (default 500, max 5000 — the wizard table virtualises)
 *   offset      — pagination offset (default 0)
 *
 * Returns: { tracks: [...], total }. Each track row includes the synthesised
 * `playlistNames: string[]` so the UI can render the badge stack without a
 * second roundtrip.
 */

interface TrackRow {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  popularity: number | null;
  durationMs: number | null;
  isLikedSong: number;
  localTrackId: number | null;
  matchConfidence: number | null;
  matchMethod: string | null;
  playlistNames: string | null; // group_concat result
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const playlistId = url.searchParams.get("playlistId");
  const sortParam = (url.searchParams.get("sort") || "artist").toLowerCase();
  const dedupe = url.searchParams.get("dedupe") === "1";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 5000);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

  const snap = db
    .select({ id: spotifySnapshots.id })
    .from(spotifySnapshots)
    .where(eq(spotifySnapshots.status, "complete"))
    .orderBy(desc(spotifySnapshots.completedAt))
    .limit(1)
    .get();

  if (!snap) {
    return NextResponse.json({ tracks: [], total: 0 });
  }

  // Choose ORDER BY column. Whitelist to avoid SQL injection — only allow
  // a small set; default to artist + title for stable ordering.
  const orderBy =
    sortParam === "title"
      ? sql.raw("LOWER(st.title), LOWER(st.artist)")
      : sortParam === "album"
        ? sql.raw("LOWER(st.album), LOWER(st.title)")
        : sortParam === "popularity"
          ? sql.raw("st.popularity DESC NULLS LAST, LOWER(st.artist)")
          : sql.raw("LOWER(st.artist), LOWER(st.album), LOWER(st.title)");

  // playlistId filter: numeric → tracks in that playlist; "liked" → liked-only;
  // missing → all tracks across the snapshot.
  let whereClause = sql`st.snapshot_id = ${snap.id}`;
  if (playlistId === "liked") {
    whereClause = sql`${whereClause} AND st.is_liked_song = 1`;
  } else if (playlistId && playlistId !== "all") {
    const pid = parseInt(playlistId, 10);
    if (Number.isFinite(pid)) {
      whereClause = sql`${whereClause} AND st.id IN (
        SELECT spotify_track_id FROM spotify_playlist_tracks WHERE spotify_playlist_id = ${pid}
      )`;
    }
  }

  // Group-aggregate playlist names so each row carries the badge list inline.
  // For dedupe, GROUP BY normalised (artist, title) keeping the lowest id.
  const baseQuery = sql`
    SELECT
      st.id              AS id,
      st.title           AS title,
      st.artist          AS artist,
      st.album           AS album,
      st.cover_url       AS coverUrl,
      st.popularity      AS popularity,
      st.duration_ms     AS durationMs,
      st.is_liked_song   AS isLikedSong,
      st.local_track_id  AS localTrackId,
      st.match_confidence AS matchConfidence,
      st.match_method    AS matchMethod,
      (
        SELECT GROUP_CONCAT(DISTINCT sp2.name)
        FROM spotify_playlist_tracks spt2
        JOIN spotify_playlists sp2 ON sp2.id = spt2.spotify_playlist_id
        WHERE spt2.spotify_track_id = st.id
      )                  AS playlistNames
    FROM spotify_tracks st
    WHERE ${whereClause}
    ORDER BY ${orderBy}
  `;

  let rows: TrackRow[];
  if (dedupe) {
    // De-dupe wraps the base query in an outer GROUP BY (artist+title lower).
    rows = db.all(sql`
      SELECT * FROM (${baseQuery})
      GROUP BY LOWER(artist), LOWER(title)
      LIMIT ${limit} OFFSET ${offset}
    `) as TrackRow[];
  } else {
    rows = db.all(sql`${baseQuery} LIMIT ${limit} OFFSET ${offset}`) as TrackRow[];
  }

  // Count for pagination — same WHERE, no GROUP BY (or dedupe count).
  const totalRow = db.get(sql`
    SELECT COUNT(*) AS n FROM (
      SELECT ${dedupe ? sql.raw("DISTINCT LOWER(st.artist), LOWER(st.title)") : sql.raw("st.id")}
      FROM spotify_tracks st
      WHERE ${whereClause}
    )
  `) as { n: number } | undefined;

  const tracks = rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    coverUrl: r.coverUrl,
    popularity: r.popularity,
    durationMs: r.durationMs,
    isLikedSong: !!r.isLikedSong,
    isMatched: r.localTrackId !== null,
    matchConfidence: r.matchConfidence,
    matchMethod: r.matchMethod,
    playlistNames: r.playlistNames ? r.playlistNames.split(",") : [],
  }));

  return NextResponse.json({ tracks, total: totalRow?.n ?? 0 });
}
