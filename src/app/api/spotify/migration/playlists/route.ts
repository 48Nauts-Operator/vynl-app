import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotifySnapshots } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

/**
 * GET /api/spotify/migration/playlists
 *
 * Returns the list of Spotify playlists from the latest completed
 * snapshot, each annotated with track / matched / missing counts.
 * The wizard renders these as the sidebar; the user clicks one to
 * filter the tracks table.
 *
 * Includes a synthetic "Liked Songs" entry — Spotify exposes liked
 * songs as a flag on tracks rather than as a real playlist, so we
 * fabricate it here so the UI can present a uniform sidebar.
 */
export async function GET() {
  const snap = db
    .select({ id: spotifySnapshots.id })
    .from(spotifySnapshots)
    .where(eq(spotifySnapshots.status, "complete"))
    .orderBy(desc(spotifySnapshots.completedAt))
    .limit(1)
    .get();

  if (!snap) {
    return NextResponse.json({ playlists: [] });
  }

  interface PlaylistRow {
    id: number;
    spotifyId: string;
    name: string;
    imageUrl: string | null;
    trackCount: number;
    matchedCount: number | null;
    missingCount: number | null;
  }
  const rows = db.all(sql`
    SELECT
      sp.id              AS id,
      sp.spotify_id      AS spotifyId,
      sp.name            AS name,
      sp.image_url       AS imageUrl,
      COUNT(spt.id)      AS trackCount,
      SUM(CASE WHEN st.local_track_id IS NOT NULL THEN 1 ELSE 0 END) AS matchedCount,
      SUM(CASE WHEN st.local_track_id IS NULL     THEN 1 ELSE 0 END) AS missingCount
    FROM spotify_playlists sp
    LEFT JOIN spotify_playlist_tracks spt ON spt.spotify_playlist_id = sp.id
    LEFT JOIN spotify_tracks st           ON st.id = spt.spotify_track_id
    WHERE sp.snapshot_id = ${snap.id}
    GROUP BY sp.id, sp.spotify_id, sp.name, sp.image_url
    ORDER BY sp.name COLLATE NOCASE
  `) as PlaylistRow[];

  interface LikedRow {
    trackCount: number;
    matchedCount: number | null;
    missingCount: number | null;
  }
  const liked = db.get(sql`
    SELECT
      COUNT(*)                                                 AS trackCount,
      SUM(CASE WHEN local_track_id IS NOT NULL THEN 1 ELSE 0 END) AS matchedCount,
      SUM(CASE WHEN local_track_id IS NULL     THEN 1 ELSE 0 END) AS missingCount
    FROM spotify_tracks
    WHERE snapshot_id = ${snap.id} AND is_liked_song = 1
  `) as LikedRow | undefined;

  const playlists = [
    ...(liked && liked.trackCount > 0
      ? [
          {
            id: -1,
            spotifyId: "__liked__",
            name: "Liked Songs",
            imageUrl: null,
            trackCount: liked.trackCount,
            matchedCount: liked.matchedCount ?? 0,
            missingCount: liked.missingCount ?? 0,
            isLiked: true,
          },
        ]
      : []),
    ...rows.map((r) => ({
      ...r,
      matchedCount: r.matchedCount ?? 0,
      missingCount: r.missingCount ?? 0,
      isLiked: false,
    })),
  ];

  return NextResponse.json({ playlists });
}
