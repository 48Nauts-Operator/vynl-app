import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotifySnapshots } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * GET /api/spotify/migration/snapshot
 *
 * Returns metadata about the latest COMPLETED Spotify sync snapshot.
 * The wizard uses this to decide whether to auto-trigger a first sync
 * (empty → auto) or show the synced-state UI with a "Re-sync" button.
 *
 * 404 when no completed snapshot exists yet.
 */
export async function GET() {
  const snap = db
    .select()
    .from(spotifySnapshots)
    .where(eq(spotifySnapshots.status, "complete"))
    .orderBy(desc(spotifySnapshots.completedAt))
    .limit(1)
    .get();

  if (!snap) {
    return NextResponse.json({ error: "No completed snapshot" }, { status: 404 });
  }

  return NextResponse.json({
    snapshotId: snap.id,
    syncedAt: snap.completedAt,
    startedAt: snap.startedAt,
    playlistCount: snap.totalPlaylists ?? 0,
    trackCount: snap.totalTracks ?? 0,
    likedSongCount: snap.totalLikedSongs ?? 0,
    matchedCount: snap.matchedTracks ?? 0,
    missingCount: snap.unmatchedTracks ?? 0,
  });
}
