import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const sort = request.nextUrl.searchParams.get("sort") || "artist";
    const genre = request.nextUrl.searchParams.get("genre");

    let query = `
      SELECT
        album,
        COALESCE(album_artist, artist) as album_artist,
        year,
        cover_path,
        genre,
        COUNT(*) as track_count,
        SUM(duration) as total_duration,
        MIN(id) as first_track_id,
        MAX(added_at) as latest_added
      FROM tracks
      WHERE source = 'local'
    `;

    const params: string[] = [];

    if (genre) {
      query += ` AND genre = ?`;
      params.push(genre);
    }

    query += ` GROUP BY album, COALESCE(album_artist, artist)`;

    switch (sort) {
      case "recent":
        query += ` ORDER BY latest_added DESC`;
        break;
      case "name":
        query += ` ORDER BY album ASC`;
        break;
      case "year":
        query += ` ORDER BY year DESC NULLS LAST, album ASC`;
        break;
      case "artist":
      default:
        query += ` ORDER BY album_artist ASC, year ASC, album ASC`;
        break;
    }

    const sqlite = (db as any).session?.client || (db as any).$client;
    const albums = sqlite.prepare(query).all(...params);

    // Get unique genres for filtering
    const genres = sqlite
      .prepare(
        `SELECT DISTINCT genre FROM tracks WHERE genre IS NOT NULL AND genre != '' ORDER BY genre`
      )
      .all()
      .map((r: any) => r.genre);

    return NextResponse.json({ albums, genres });
  } catch (err) {
    console.error("Albums error:", err);
    return NextResponse.json(
      { error: "Failed to fetch albums", details: String(err) },
      { status: 500 }
    );
  }
}
