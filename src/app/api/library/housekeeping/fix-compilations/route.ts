import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST — Fix compilations: find albums with many distinct artists
 * and set album_artist to "Various Artists"
 */
export async function POST() {
  try {
    const sqlite = (db as any).session?.client || (db as any).$client;

    // Find albums with 4+ distinct artists that have at least one track
    // without album_artist = "Various Artists"
    const compAlbums = sqlite.prepare(`
      SELECT album,
             COUNT(DISTINCT artist) as artist_count,
             COUNT(*) as track_count,
             SUM(CASE WHEN COALESCE(album_artist, '') != 'Various Artists' THEN 1 ELSE 0 END) as unfixed_count
      FROM tracks
      WHERE source = 'local'
        AND album != 'Unknown Album' AND album != ''
      GROUP BY album
      HAVING COUNT(DISTINCT artist) >= 4
         AND SUM(CASE WHEN COALESCE(album_artist, '') != 'Various Artists' THEN 1 ELSE 0 END) > 0
    `).all() as { album: string; artist_count: number; track_count: number; unfixed_count: number }[];

    let fixed = 0;
    let tracksUpdated = 0;

    for (const ca of compAlbums) {
      const result = sqlite.prepare(
        `UPDATE tracks SET album_artist = 'Various Artists'
         WHERE album = ? AND source = 'local' AND COALESCE(album_artist, '') != 'Various Artists'`
      ).run(ca.album);
      fixed++;
      tracksUpdated += result.changes;
    }

    return NextResponse.json({
      fixed,
      tracksUpdated,
      albums: compAlbums.map((a) => ({
        album: a.album,
        distinctArtists: a.artist_count,
        tracks: a.track_count,
      })),
    });
  } catch (err) {
    console.error("Fix compilations error:", err);
    return NextResponse.json(
      { error: "Failed to fix compilations", details: String(err) },
      { status: 500 }
    );
  }
}

/** GET — Preview what would be fixed */
export async function GET() {
  try {
    const sqlite = (db as any).session?.client || (db as any).$client;

    const compAlbums = sqlite.prepare(`
      SELECT album,
             COUNT(DISTINCT artist) as artist_count,
             COUNT(*) as track_count,
             SUM(CASE WHEN COALESCE(album_artist, '') != 'Various Artists' THEN 1 ELSE 0 END) as unfixed_count
      FROM tracks
      WHERE source = 'local'
        AND album != 'Unknown Album' AND album != ''
      GROUP BY album
      HAVING COUNT(DISTINCT artist) >= 4
         AND SUM(CASE WHEN COALESCE(album_artist, '') != 'Various Artists' THEN 1 ELSE 0 END) > 0
    `).all() as { album: string; artist_count: number; track_count: number; unfixed_count: number }[];

    return NextResponse.json({
      count: compAlbums.length,
      albums: compAlbums.map((a) => ({
        album: a.album,
        distinctArtists: a.artist_count,
        tracks: a.track_count,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
