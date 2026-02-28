import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  playlists,
  playlistTracks,
  trackRatings,
  listeningHistory,
  trackLyrics,
  settings,
} from "@/lib/db/schema";

// Export user data (playlists, ratings, history, lyrics, settings)
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
