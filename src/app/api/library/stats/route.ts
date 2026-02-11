import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "4weeks";

  // Calculate date cutoff
  let daysBack: number;
  switch (period) {
    case "1week": daysBack = 7; break;
    case "4weeks": daysBack = 28; break;
    case "3months": daysBack = 90; break;
    case "all": daysBack = 36500; break;
    default: daysBack = 28;
  }

  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();

  try {
    // Top tracks by play count in listening_history within period
    const topTracks = db.all(sql`
      SELECT
        h.track_id as id,
        h.track_title as title,
        h.track_artist as artist,
        t.album,
        t.cover_path as coverPath,
        COUNT(*) as playCount,
        MAX(h.played_at) as lastPlayed
      FROM listening_history h
      LEFT JOIN tracks t ON t.id = h.track_id
      WHERE h.played_at >= ${cutoff}
      GROUP BY COALESCE(h.track_id, h.track_title || h.track_artist)
      ORDER BY playCount DESC
      LIMIT 10
    `);

    // Top albums by total plays within period
    const topAlbums = db.all(sql`
      SELECT
        t.album,
        COALESCE(t.album_artist, t.artist) as albumArtist,
        t.cover_path as coverPath,
        SUM(t.play_count) as totalPlays,
        COUNT(DISTINCT t.id) as trackCount
      FROM tracks t
      WHERE t.play_count > 0
        AND t.album != 'Unknown Album'
      GROUP BY t.album, COALESCE(t.album_artist, t.artist)
      ORDER BY totalPlays DESC
      LIMIT 10
    `);

    // Total stats
    const totals = db.get(sql`
      SELECT
        COUNT(*) as totalPlays,
        COALESCE(SUM(h.listened_duration), 0) / 3600.0 as totalHours
      FROM listening_history h
      WHERE h.played_at >= ${cutoff}
    `) as { totalPlays: number; totalHours: number } | undefined;

    return NextResponse.json({
      topTracks,
      topAlbums,
      totalTracksPlayed: totals?.totalPlays || 0,
      totalListeningHours: Math.round((totals?.totalHours || 0) * 10) / 10,
      period,
    });
  } catch (err) {
    console.error("Stats error:", err);
    return NextResponse.json(
      { error: "Failed to load stats", details: String(err) },
      { status: 500 }
    );
  }
}
