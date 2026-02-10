import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql, eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // id is formatted as "albumArtist---album" (URL-encoded)
    const [albumArtist, album] = decodeURIComponent(id).split("---");

    if (!album) {
      return NextResponse.json(
        { error: "Invalid album ID format. Expected: albumArtist---album" },
        { status: 400 }
      );
    }

    const sqlite = (db as any).session?.client || (db as any).$client;

    const albumTracks = sqlite
      .prepare(
        `SELECT * FROM tracks
         WHERE (album_artist = ? OR artist = ?) AND album = ?
         ORDER BY disc_number ASC, track_number ASC`
      )
      .all(albumArtist, albumArtist, album);

    if (albumTracks.length === 0) {
      return NextResponse.json(
        { error: "Album not found" },
        { status: 404 }
      );
    }

    const first = albumTracks[0];
    const albumInfo = {
      album: first.album,
      albumArtist: first.album_artist || first.artist,
      year: first.year,
      genre: first.genre,
      coverPath: first.cover_path,
      trackCount: albumTracks.length,
      totalDuration: albumTracks.reduce(
        (sum: number, t: any) => sum + (t.duration || 0),
        0
      ),
      tracks: albumTracks.map((t: any) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        albumArtist: t.album_artist,
        genre: t.genre,
        year: t.year,
        trackNumber: t.track_number,
        discNumber: t.disc_number,
        duration: t.duration,
        filePath: t.file_path,
        fileSize: t.file_size,
        format: t.format,
        bitrate: t.bitrate,
        sampleRate: t.sample_rate,
        coverPath: t.cover_path,
        source: t.source,
        addedAt: t.added_at,
        playCount: t.play_count,
      })),
    };

    return NextResponse.json(albumInfo);
  } catch (err) {
    console.error("Album detail error:", err);
    return NextResponse.json(
      { error: "Failed to fetch album", details: String(err) },
      { status: 500 }
    );
  }
}
