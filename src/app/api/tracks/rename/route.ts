import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { id, title, artist, album, albumArtist } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, string> = {};
    if (title !== undefined) updates.title = title;
    if (artist !== undefined) updates.artist = artist;
    if (album !== undefined) updates.album = album;
    if (albumArtist !== undefined) updates.albumArtist = albumArtist;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    db.update(tracks)
      .set(updates as any)
      .where(eq(tracks.id, id))
      .run();

    return NextResponse.json({ updated: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Rename failed", details: String(err) },
      { status: 500 }
    );
  }
}
