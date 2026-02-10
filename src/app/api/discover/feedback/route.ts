import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasteFeedback } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, trackId, trackTitle, trackArtist, rating } = body;

  if (!sessionId || !trackTitle || !trackArtist || !rating) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = db
    .insert(tasteFeedback)
    .values({
      sessionId,
      trackId: trackId || null,
      trackTitle,
      trackArtist,
      rating,
    })
    .returning()
    .get();

  return NextResponse.json(result);
}
