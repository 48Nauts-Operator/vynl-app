import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { identifyByName, identifyByAudio } from "@/lib/identify";

export const maxDuration = 60;
export const runtime = "nodejs";

// POST /api/tracks/[id]/identify
//   Body: { mode: "name" | "audio", acoustIdKey?: string }
//
// Returns: { current: { title, artist, album }, candidates: IdentifyMatch[] }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: "invalid track id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = (body.mode === "audio" ? "audio" : "name") as "name" | "audio";
  const acoustIdKey: string | undefined = body.acoustIdKey;

  const track = db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!track) {
    return NextResponse.json({ error: "track not found" }, { status: 404 });
  }

  try {
    let candidates;
    if (mode === "name") {
      if (!track.title || !track.artist || track.artist === "Unknown Artist") {
        return NextResponse.json(
          {
            error:
              "Track has no usable title/artist for a name lookup. Try audio mode instead.",
          },
          { status: 400 }
        );
      }
      candidates = await identifyByName(track.title, track.artist);
    } else {
      candidates = await identifyByAudio(track.filePath, acoustIdKey);
    }

    return NextResponse.json({
      current: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArtist: track.albumArtist,
        year: track.year,
      },
      candidates,
      mode,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err).replace(/^Error:\s*/, "") },
      { status: 500 }
    );
  }
}
