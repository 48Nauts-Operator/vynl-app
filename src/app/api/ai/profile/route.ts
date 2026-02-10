import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasteFeedback, discoverySessions, tasteProfile } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateTasteProfile } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const { sessionId } = await request.json();

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  const session = db
    .select()
    .from(discoverySessions)
    .where(eq(discoverySessions.id, sessionId))
    .get();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const feedback = db
    .select()
    .from(tasteFeedback)
    .where(eq(tasteFeedback.sessionId, sessionId))
    .all();

  if (feedback.length === 0) {
    return NextResponse.json({ error: "No feedback found" }, { status: 400 });
  }

  try {
    const preferences = {
      genres: JSON.parse(session.genres || "[]"),
      moodLevel: session.moodLevel || 5,
      tempoLevel: session.tempoLevel || 5,
      era: session.eraPreference || "any",
    };

    const result = await generateTasteProfile(
      feedback.map((f) => ({
        title: f.trackTitle,
        artist: f.trackArtist,
        rating: f.rating as "bad" | "ok" | "amazing",
      })),
      preferences
    );

    // Save profile
    const saved = db
      .insert(tasteProfile)
      .values({
        profileText: result.profileText,
        genreDistribution: JSON.stringify(result.genreDistribution),
        topArtists: JSON.stringify(result.topArtists),
        moodPreferences: JSON.stringify(result.moodPreferences),
        feedbackCount: feedback.length,
      })
      .returning()
      .get();

    // Mark session complete
    db.update(discoverySessions)
      .set({ status: "completed", completedAt: new Date().toISOString() })
      .where(eq(discoverySessions.id, sessionId))
      .run();

    return NextResponse.json(saved);
  } catch (err) {
    console.error("Profile generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate profile", details: String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  const profiles = db.select().from(tasteProfile).all();
  const latest = profiles[profiles.length - 1] || null;
  return NextResponse.json({ profile: latest, all: profiles });
}
