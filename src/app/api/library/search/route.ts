import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { like, or } from "drizzle-orm";
import * as sonos from "@/lib/sonos";

interface SearchResult {
  source: "local" | "spotify" | "youtube" | "radio";
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  coverPath?: string;
  trackId?: number;
  filePath?: string;
  spotifyUri?: string;
  youtubeId?: string;
  streamUrl?: string;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  const sources = (request.nextUrl.searchParams.get("sources") || "local,spotify,radio").split(",");

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const results: SearchResult[] = [];

  // Local library search
  if (sources.includes("local")) {
    const pattern = `%${query}%`;
    const localResults = db
      .select()
      .from(tracks)
      .where(
        or(
          like(tracks.title, pattern),
          like(tracks.artist, pattern),
          like(tracks.album, pattern)
        )
      )
      .limit(20)
      .all();

    results.push(
      ...localResults.map((t) => ({
        source: "local" as const,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        coverPath: t.coverPath || undefined,
        trackId: t.id,
        filePath: t.filePath,
      }))
    );
  }

  // Spotify search
  if (sources.includes("spotify")) {
    try {
      const spotifyResults = await sonos.searchSpotify(query, 10);
      for (const item of spotifyResults) {
        results.push({
          source: "spotify",
          title: item.name || item.title || "Unknown",
          artist: item.artist || item.artists?.[0]?.name || "Unknown",
          album: item.album || item.album_name,
          spotifyUri: item.uri || item.spotify_uri,
        });
      }
    } catch {
      // Spotify search failed, continue
    }
  }

  // Radio Browser API search
  if (sources.includes("radio")) {
    try {
      const radioResponse = await fetch(
        `https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(query)}?limit=10`,
        { headers: { "User-Agent": "Tunify/1.0" } }
      );
      if (radioResponse.ok) {
        const stations = await radioResponse.json();
        results.push(
          ...stations.map((s: { name: string; tags: string; url_resolved: string; favicon: string }) => ({
            source: "radio" as const,
            title: s.name,
            artist: s.tags || "Internet Radio",
            streamUrl: s.url_resolved,
            coverPath: s.favicon || undefined,
          }))
        );
      }
    } catch {
      // Radio search failed, continue
    }
  }

  return NextResponse.json({ results });
}
