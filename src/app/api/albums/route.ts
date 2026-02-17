import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const sort = request.nextUrl.searchParams.get("sort") || "artist";
    const genre = request.nextUrl.searchParams.get("genre");
    const search = request.nextUrl.searchParams.get("search")?.trim();
    const limit = request.nextUrl.searchParams.get("limit");

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

    if (search) {
      const like = `%${search}%`;
      const isDecade = /^\d{2}$/.test(search);
      if (isDecade) {
        const d = parseInt(search, 10);
        const start = d >= 50 ? 1900 + d : 2000 + d;
        const end = start + 10;
        query += ` AND (album LIKE ? OR COALESCE(album_artist, artist) LIKE ? OR title LIKE ? OR genre LIKE ? OR CAST(year AS TEXT) LIKE ? OR (year >= ? AND year < ?))`;
        params.push(like, like, like, like, like, String(start), String(end));
      } else {
        query += ` AND (album LIKE ? OR COALESCE(album_artist, artist) LIKE ? OR title LIKE ? OR genre LIKE ? OR CAST(year AS TEXT) LIKE ?)`;
        params.push(like, like, like, like, like);
      }
    }

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

    if (limit && /^\d+$/.test(limit)) {
      query += ` LIMIT ?`;
      params.push(limit);
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
