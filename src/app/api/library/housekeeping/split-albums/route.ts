import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

interface SplitAlbumArtist {
  name: string;
  trackCount: number;
}

interface SplitAlbum {
  album: string;
  artists: SplitAlbumArtist[];
  totalTracks: number;
  suggestedPrimary: string;
}

export async function GET() {
  try {
    // Find albums with multiple distinct albumArtist/artist values
    const rows = db.all(sql`
      SELECT album,
             COALESCE(album_artist, artist) as effective_artist,
             COUNT(*) as track_count
      FROM tracks
      WHERE album != 'Unknown Album' AND album != ''
      GROUP BY album, effective_artist
    `) as { album: string; effective_artist: string; track_count: number }[];

    // Group by album name
    const albumMap = new Map<string, SplitAlbumArtist[]>();
    for (const row of rows) {
      if (!albumMap.has(row.album)) albumMap.set(row.album, []);
      albumMap.get(row.album)!.push({
        name: row.effective_artist,
        trackCount: row.track_count,
      });
    }

    // Filter to only albums with >1 distinct artist
    const splitAlbums: SplitAlbum[] = [];
    for (const [album, artists] of albumMap) {
      if (artists.length <= 1) continue;

      // Exclude true compilations: "Various Artists" present or >10 distinct artists
      const isCompilation =
        artists.some((a) => a.name.toLowerCase() === "various artists") ||
        artists.length > 10;
      if (isCompilation) continue;

      // Sort by track count descending — most tracks = likely primary artist
      artists.sort((a, b) => b.trackCount - a.trackCount);
      const totalTracks = artists.reduce((sum, a) => sum + a.trackCount, 0);

      splitAlbums.push({
        album,
        artists,
        totalTracks,
        suggestedPrimary: artists[0].name,
      });
    }

    // Sort by total tracks descending (biggest problems first)
    splitAlbums.sort((a, b) => b.totalTracks - a.totalTracks);

    return NextResponse.json({ splitAlbums });
  } catch (err) {
    console.error("Split album detection error:", err);
    return NextResponse.json(
      { error: "Failed to detect split albums", details: String(err) },
      { status: 500 }
    );
  }
}
