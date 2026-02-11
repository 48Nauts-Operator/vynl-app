import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcasts, podcastEpisodes } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET — podcast detail with episodes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const podcastId = parseInt(id);

  const podcast = db
    .select()
    .from(podcasts)
    .where(eq(podcasts.id, podcastId))
    .get();

  if (!podcast) {
    return NextResponse.json({ error: "Podcast not found" }, { status: 404 });
  }

  const episodes = db
    .select()
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.podcastId, podcastId))
    .orderBy(desc(podcastEpisodes.pubDate))
    .all();

  return NextResponse.json({ podcast, episodes });
}

// DELETE — unsubscribe
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const podcastId = parseInt(id);

  db.delete(podcasts).where(eq(podcasts.id, podcastId)).run();

  return NextResponse.json({ success: true });
}
