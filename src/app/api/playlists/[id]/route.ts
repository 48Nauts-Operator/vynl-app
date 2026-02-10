import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { playlists, playlistTracks, tracks } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playlistId = parseInt(id);

  const playlist = db
    .select()
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .get();

  if (!playlist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const playlistTrackList = db
    .select({
      position: playlistTracks.position,
      track: tracks,
    })
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(asc(playlistTracks.position))
    .all();

  return NextResponse.json({
    ...playlist,
    tracks: playlistTrackList.map((pt) => ({ ...pt.track, position: pt.position })),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const playlistId = parseInt(id);
  const body = await request.json();
  const { name, description, coverPath, trackIds } = body;

  db.update(playlists)
    .set({
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(coverPath && { coverPath }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(playlists.id, playlistId))
    .run();

  if (trackIds) {
    db.delete(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .run();

    for (let i = 0; i < trackIds.length; i++) {
      db.insert(playlistTracks)
        .values({ playlistId, trackId: trackIds[i], position: i })
        .run();
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  db.delete(playlists).where(eq(playlists.id, parseInt(id))).run();
  return NextResponse.json({ success: true });
}
