import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  playlists,
  playlistTracks,
  trackRatings,
  listeningHistory,
  trackLyrics,
  settings,
  podcasts,
  podcastEpisodes,
  episodeInsights,
} from "@/lib/db/schema";

// Export user data (playlists, ratings, history, lyrics, settings, podcasts)
// This data can't be recreated by a library scan — it's user-generated
export async function GET() {
  try {
    const data = {
      playlists: db.select().from(playlists).all(),
      playlistTracks: db.select().from(playlistTracks).all(),
      trackRatings: db.select().from(trackRatings).all(),
      listeningHistory: db.select().from(listeningHistory).all(),
      trackLyrics: db.select().from(trackLyrics).all(),
      settings: db.select().from(settings).all(),
      podcasts: db.select().from(podcasts).all(),
      podcastEpisodes: db.select().from(podcastEpisodes).all(),
      episodeInsights: db.select().from(episodeInsights).all(),
      exportedAt: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Export failed", details: String(err) },
      { status: 500 }
    );
  }
}
