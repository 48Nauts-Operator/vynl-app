import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcastEpisodes, episodeInsights } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET — episode detail with insights
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  const { episodeId } = await params;
  const epId = parseInt(episodeId);

  const episode = db
    .select()
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, epId))
    .get();

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const insights = db
    .select()
    .from(episodeInsights)
    .where(eq(episodeInsights.episodeId, epId))
    .all();

  return NextResponse.json({ episode, insights });
}
