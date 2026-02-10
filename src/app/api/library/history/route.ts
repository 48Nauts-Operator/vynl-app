import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listeningHistory, tracks } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

  const history = db
    .select()
    .from(listeningHistory)
    .orderBy(desc(listeningHistory.playedAt))
    .limit(limit)
    .all();

  return NextResponse.json({ history });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { trackId, trackTitle, trackArtist, source, duration, listenedDuration, outputTarget } = body;

  const entry = db
    .insert(listeningHistory)
    .values({
      trackId,
      trackTitle,
      trackArtist,
      source: source || "local",
      duration,
      listenedDuration,
      outputTarget: outputTarget || "browser",
    })
    .returning()
    .get();

  // Update play count on track
  if (trackId) {
    db.update(tracks)
      .set({
        playCount: sql`play_count + 1`,
        lastPlayedAt: new Date().toISOString(),
      })
      .where(eq(tracks.id, trackId))
      .run();
  }

  return NextResponse.json(entry);
}
