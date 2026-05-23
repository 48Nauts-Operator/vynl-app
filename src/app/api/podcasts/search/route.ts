import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcasts } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export interface PodcastSearchResult {
  feedUrl: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  episodeCount: number | null;
  genre: string | null;
  releaseDate: string | null;
  alreadySubscribed: boolean;
}

interface ITunesItem {
  collectionName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  trackCount?: number;
  primaryGenreName?: string;
  releaseDate?: string;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limitRaw = parseInt(url.searchParams.get("limit") || "25", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 25;

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const itunesUrl =
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}` +
    `&entity=podcast&limit=${limit}`;

  let payload: { results?: ITunesItem[] };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(itunesUrl, {
      headers: { "User-Agent": "Vynl/0.6 (+https://vynl.music)" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        { error: "iTunes search failed", status: res.status },
        { status: 502 }
      );
    }
    payload = await res.json();
  } catch (err) {
    return NextResponse.json(
      { error: "iTunes search failed", details: String(err) },
      { status: 502 }
    );
  }

  const items = (payload.results || []).filter(
    (it): it is ITunesItem & { feedUrl: string } => typeof it.feedUrl === "string" && it.feedUrl.length > 0
  );

  // Bulk-check which feeds we're already subscribed to (one query, not N).
  const feedUrls = items.map((it) => it.feedUrl);
  const subscribedSet = new Set<string>();
  if (feedUrls.length > 0) {
    const subscribed = db
      .select({ feedUrl: podcasts.feedUrl })
      .from(podcasts)
      .where(inArray(podcasts.feedUrl, feedUrls))
      .all();
    for (const row of subscribed) subscribedSet.add(row.feedUrl);
  }

  const results: PodcastSearchResult[] = items.map((it) => ({
    feedUrl: it.feedUrl,
    title: it.collectionName || "Untitled Podcast",
    author: it.artistName || null,
    coverUrl: it.artworkUrl600 || it.artworkUrl100 || null,
    episodeCount: typeof it.trackCount === "number" ? it.trackCount : null,
    genre: it.primaryGenreName || null,
    releaseDate: it.releaseDate || null,
    alreadySubscribed: subscribedSet.has(it.feedUrl),
  }));

  return NextResponse.json({ results });
}
