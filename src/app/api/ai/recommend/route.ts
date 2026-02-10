import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasteProfile, tracks } from "@/lib/db/schema";
import { getRecommendations } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const { mood, count } = await request.json();

  const profiles = db.select().from(tasteProfile).all();
  const latest = profiles[profiles.length - 1];

  if (!latest) {
    return NextResponse.json(
      { error: "No taste profile found. Complete a discovery session first." },
      { status: 400 }
    );
  }

  const existingTracks = db
    .select({ title: tracks.title, artist: tracks.artist })
    .from(tracks)
    .all();

  try {
    const recommendations = await getRecommendations(
      latest.profileText,
      existingTracks,
      mood,
      count || 10
    );

    return NextResponse.json({ recommendations });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get recommendations", details: String(err) },
      { status: 500 }
    );
  }
}
