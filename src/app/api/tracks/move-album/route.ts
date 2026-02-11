import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { trackIds, targetAlbum, targetAlbumArtist } = await request.json();

    if (!trackIds || !Array.isArray(trackIds) || !targetAlbum) {
      return NextResponse.json(
        { error: "trackIds (array) and targetAlbum are required" },
        { status: 400 }
      );
    }

    let updated = 0;
    for (const id of trackIds) {
      const setValues: Record<string, string> = { album: targetAlbum };
      if (targetAlbumArtist) {
        setValues.albumArtist = targetAlbumArtist;
      }

      db.update(tracks)
        .set(setValues as any)
        .where(sql`${tracks.id} = ${id}`)
        .run();
      updated++;
    }

    return NextResponse.json({ updated });
  } catch (err) {
    return NextResponse.json(
      { error: "Move failed", details: String(err) },
      { status: 500 }
    );
  }
}
