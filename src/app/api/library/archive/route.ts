import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";

const LIBRARY_PATH = process.env.MUSIC_LIBRARY_PATH || "/Volumes/Music/library";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { trackIds, album, albumArtist } = body;

  let targetTracks: { id: number; filePath: string }[];

  if (trackIds && trackIds.length > 0) {
    targetTracks = db
      .select({ id: tracks.id, filePath: tracks.filePath })
      .from(tracks)
      .where(inArray(tracks.id, trackIds))
      .all();
  } else if (album && albumArtist) {
    targetTracks = db
      .select({ id: tracks.id, filePath: tracks.filePath })
      .from(tracks)
      .where(and(eq(tracks.album, album), eq(tracks.albumArtist, albumArtist)))
      .all();
  } else {
    return NextResponse.json(
      { error: "Provide trackIds or album+albumArtist" },
      { status: 400 }
    );
  }

  if (targetTracks.length === 0) {
    return NextResponse.json({ archived: 0, errors: [] });
  }

  const date = new Date().toISOString().slice(0, 10);
  const archiveBase = path.join(LIBRARY_PATH, ".archive", date);
  const errors: string[] = [];
  let archived = 0;

  for (const track of targetTracks) {
    try {
      const filePath = track.filePath;
      if (!fs.existsSync(filePath)) {
        // File missing — just remove from DB
        db.delete(tracks).where(eq(tracks.id, track.id)).run();
        archived++;
        continue;
      }

      // Preserve relative path structure under archive
      const relative = path.relative(LIBRARY_PATH, filePath);
      const archiveDest = path.join(archiveBase, relative);
      fs.mkdirSync(path.dirname(archiveDest), { recursive: true });
      fs.renameSync(filePath, archiveDest);

      // Remove from DB (cascades to playlist_tracks, track_lyrics, etc.)
      db.delete(tracks).where(eq(tracks.id, track.id)).run();
      archived++;
    } catch (err: any) {
      errors.push(`Track ${track.id}: ${err.message}`);
    }
  }

  return NextResponse.json({ archived, errors });
}
