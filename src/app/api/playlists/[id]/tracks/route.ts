import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { playlistTracks, playlists } from "@/lib/db/schema";
import { eq, max } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playlistId = parseInt(id);
  const body = await request.json();
  const { trackIds } = body;

  if (!trackIds || trackIds.length === 0) {
    return NextResponse.json({ error: "trackIds required" }, { status: 400 });
  }

  // Verify playlist exists
  const playlist = db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  if (!playlist) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  // Get the current max position
  const maxPos = db
    .select({ maxPosition: max(playlistTracks.position) })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .get();

  let nextPosition = (maxPos?.maxPosition ?? -1) + 1;

  for (const trackId of trackIds) {
    db.insert(playlistTracks)
      .values({
        playlistId,
        trackId,
        position: nextPosition++,
      })
      .run();
  }

  return NextResponse.json({ added: trackIds.length, playlistId });
}
