import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcasts, podcastEpisodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseFeed } from "@/lib/podcast-utils";

// POST — refresh podcast feed
export async function POST(
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

  let parsed;
  try {
    parsed = await parseFeed(podcast.feedUrl);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse feed: ${err}` },
      { status: 500 }
    );
  }

  // Get existing guids
  const existing = db
    .select({ guid: podcastEpisodes.guid })
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.podcastId, podcastId))
    .all();

  const existingGuids = new Set(existing.map((e) => e.guid));

  let newCount = 0;
  for (const ep of parsed.episodes) {
    if (ep.guid && existingGuids.has(ep.guid)) continue;

    try {
      db.insert(podcastEpisodes)
        .values({
          podcastId,
          guid: ep.guid,
          title: ep.title,
          description: ep.description,
          pubDate: ep.pubDate,
          duration: ep.duration,
          audioUrl: ep.audioUrl,
          coverUrl: ep.coverUrl,
          fileSize: ep.fileSize,
        })
        .run();
      newCount++;
    } catch {
      // Skip duplicates
    }
  }

  // Update lastFetchedAt
  db.update(podcasts)
    .set({ lastFetchedAt: new Date().toISOString() })
    .where(eq(podcasts.id, podcastId))
    .run();

  return NextResponse.json({ newEpisodes: newCount });
}
