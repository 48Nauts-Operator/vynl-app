// [VynlDJ] — extractable: load a specific DJ session with track list
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { djSessions, djSessionTracks, tracks } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  if (isNaN(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const [session] = db
    .select()
    .from(djSessions)
    .where(eq(djSessions.id, sessionId))
    .all();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Fetch session tracks joined with track data
  const sessionTracks = db
    .select({
      position: djSessionTracks.position,
      djNote: djSessionTracks.djNote,
      played: djSessionTracks.played,
      skipped: djSessionTracks.skipped,
      id: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      album: tracks.album,
      albumArtist: tracks.albumArtist,
      duration: tracks.duration,
      filePath: tracks.filePath,
      coverPath: tracks.coverPath,
      source: tracks.source,
      sourceId: tracks.sourceId,
    })
    .from(djSessionTracks)
    .innerJoin(tracks, eq(djSessionTracks.trackId, tracks.id))
    .where(eq(djSessionTracks.sessionId, sessionId))
    .orderBy(asc(djSessionTracks.position))
    .all();

  return NextResponse.json({ session, tracks: sessionTracks });
}
