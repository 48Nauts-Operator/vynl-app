import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcasts, podcastEpisodes } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { parseFeed, downloadCoverArt } from "@/lib/podcast-utils";

// GET — list all podcasts with episode counts
export async function GET() {
  const results = db
    .select({
      id: podcasts.id,
      title: podcasts.title,
      author: podcasts.author,
      description: podcasts.description,
      feedUrl: podcasts.feedUrl,
      coverPath: podcasts.coverPath,
      lastFetchedAt: podcasts.lastFetchedAt,
      addedAt: podcasts.addedAt,
      episodeCount: sql<number>`(SELECT COUNT(*) FROM podcast_episodes WHERE podcast_id = ${podcasts.id})`,
    })
    .from(podcasts)
    .orderBy(desc(podcasts.addedAt))
    .all();

  return NextResponse.json(results);
}

// POST — subscribe to a new podcast
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { feedUrl } = body;

  if (!feedUrl || typeof feedUrl !== "string") {
    return NextResponse.json({ error: "feedUrl is required" }, { status: 400 });
  }

  // Check for duplicate
  const existing = db
    .select()
    .from(podcasts)
    .where(eq(podcasts.feedUrl, feedUrl))
    .get();

  if (existing) {
    return NextResponse.json(
      { error: "Already subscribed to this podcast", podcast: existing },
      { status: 409 }
    );
  }

  let parsed;
  try {
    parsed = await parseFeed(feedUrl);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse feed: ${err}` },
      { status: 400 }
    );
  }

  // Download cover art
  let coverPath: string | null = null;
  if (parsed.coverUrl) {
    coverPath = await downloadCoverArt(parsed.coverUrl);
  }

  // Insert podcast
  const podcast = db
    .insert(podcasts)
    .values({
      title: parsed.title,
      author: parsed.author,
      description: parsed.description,
      feedUrl,
      coverUrl: parsed.coverUrl,
      coverPath,
      lastFetchedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  // Insert episodes
  let insertedCount = 0;
  for (const ep of parsed.episodes) {
    try {
      db.insert(podcastEpisodes)
        .values({
          podcastId: podcast.id,
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
      insertedCount++;
    } catch {
      // Skip duplicate guids
    }
  }

  return NextResponse.json({
    podcast,
    episodesImported: insertedCount,
  });
}
