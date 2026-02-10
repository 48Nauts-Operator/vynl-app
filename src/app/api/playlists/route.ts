import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { playlists, playlistTracks, tracks } from "@/lib/db/schema";
import { eq, count, asc } from "drizzle-orm";

export async function GET() {
  const allPlaylists = db.select().from(playlists).all();

  const result = allPlaylists.map((playlist) => {
    const trackCount = db
      .select({ count: count() })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlist.id))
      .get();

    return { ...playlist, trackCount: trackCount?.count || 0 };
  });

  return NextResponse.json({ playlists: result });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, trackIds } = body;

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const playlist = db
    .insert(playlists)
    .values({ name, description })
    .returning()
    .get();

  if (trackIds && trackIds.length > 0) {
    for (let i = 0; i < trackIds.length; i++) {
      db.insert(playlistTracks)
        .values({
          playlistId: playlist.id,
          trackId: trackIds[i],
          position: i,
        })
        .run();
    }
  }

  return NextResponse.json(playlist);
}
