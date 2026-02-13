import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackRatings, tracks } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Mode 1: bulk by track IDs
  const trackIdsParam = searchParams.get("trackIds");
  if (trackIdsParam) {
    const ids = trackIdsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    if (ids.length === 0) {
      return NextResponse.json({ ratings: {} });
    }

    const rows = db
      .select({ trackId: trackRatings.trackId, rating: trackRatings.rating })
      .from(trackRatings)
      .where(inArray(trackRatings.trackId, ids))
      .all();

    const ratings: Record<number, number> = {};
    for (const r of rows) {
      ratings[r.trackId] = r.rating;
    }
    return NextResponse.json({ ratings });
  }

  // Mode 2: by album + albumArtist
  const album = searchParams.get("album");
  const albumArtist = searchParams.get("albumArtist");
  if (album) {
    const conditions = [eq(tracks.album, album)];
    if (albumArtist) {
      conditions.push(eq(tracks.albumArtist, albumArtist));
    }

    const rows = db
      .select({ trackId: trackRatings.trackId, rating: trackRatings.rating })
      .from(trackRatings)
      .innerJoin(tracks, eq(tracks.id, trackRatings.trackId))
      .where(and(...conditions))
      .all();

    const ratings: Record<number, number> = {};
    for (const r of rows) {
      ratings[r.trackId] = r.rating;
    }
    return NextResponse.json({ ratings });
  }

  return NextResponse.json({ error: "Provide trackIds or album param" }, { status: 400 });
}
