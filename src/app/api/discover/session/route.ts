import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { discoverySessions, tasteFeedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { genres, moodLevel, tempoLevel, eraPreference } = body;

  const result = db
    .insert(discoverySessions)
    .values({
      genres: JSON.stringify(genres || []),
      moodLevel: moodLevel || 5,
      tempoLevel: tempoLevel || 5,
      eraPreference: eraPreference || "any",
      status: "active",
    })
    .returning()
    .get();

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const session = db
      .select()
      .from(discoverySessions)
      .where(eq(discoverySessions.id, parseInt(id)))
      .get();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const feedback = db
      .select()
      .from(tasteFeedback)
      .where(eq(tasteFeedback.sessionId, parseInt(id)))
      .all();

    return NextResponse.json({ ...session, feedback });
  }

  const sessions = db.select().from(discoverySessions).all();
  return NextResponse.json(sessions);
}
