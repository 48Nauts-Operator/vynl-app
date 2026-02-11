import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { oldAlbum, oldAlbumArtist, newAlbum, newAlbumArtist } = await request.json();

    if (!oldAlbum || !newAlbum) {
      return NextResponse.json(
        { error: "oldAlbum and newAlbum are required" },
        { status: 400 }
      );
    }

    // Build WHERE clause to match the original album
    let result;
    if (oldAlbumArtist) {
      result = db.update(tracks)
        .set({
          album: newAlbum,
          ...(newAlbumArtist ? { albumArtist: newAlbumArtist } : {}),
        })
        .where(sql`${tracks.album} = ${oldAlbum} AND (${tracks.albumArtist} = ${oldAlbumArtist} OR ${tracks.artist} = ${oldAlbumArtist})`)
        .run();
    } else {
      result = db.update(tracks)
        .set({
          album: newAlbum,
          ...(newAlbumArtist ? { albumArtist: newAlbumArtist } : {}),
        })
        .where(sql`${tracks.album} = ${oldAlbum}`)
        .run();
    }

    return NextResponse.json({ updated: result.changes });
  } catch (err) {
    return NextResponse.json(
      { error: "Rename failed", details: String(err) },
      { status: 500 }
    );
  }
}
