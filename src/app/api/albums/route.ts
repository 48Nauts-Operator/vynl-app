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
    // types: comma-separated subset of [albums, compilations, singles].
    // Missing/empty = all three (no filter). All three present = same as
    // missing. Mix freely (e.g. ?types=albums,compilations excludes singles).
    const typesRaw = (request.nextUrl.searchParams.get("types") || "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const types = new Set(typesRaw);

    let query = `
      SELECT
        album,
        COALESCE(album_artist, artist) as album_artist,
        year,
        cover_path,
        genre,
        COUNT(*) as track_count,
        MAX(is_compilation) as is_compilation,
        -- MB release type per group: use the most-frequent non-null value.
        -- MAX() works because string comparison is consistent and the
        -- common types ("single","ep","album") sort distinctly enough.
        MAX(album_type) as album_type,
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

    // Type filter via HAVING — applied after grouping so we can use
    // MAX(is_compilation) and COUNT(*) aggregates. Multi-select: each
    // requested type contributes an OR'd condition. All three (or none)
    // means no HAVING.
    const allTypes = ["albums", "compilations", "singles"];
    const activeTypes = types.size === 0 || allTypes.every((t) => types.has(t))
      ? []
      : allTypes.filter((t) => types.has(t));
    if (activeTypes.length > 0) {
      const clauses = activeTypes.map((t) => {
        switch (t) {
          case "albums":
            // Default bucket: not a compilation, not explicitly classified
            // as single/ep/comp/soundtrack. Track-count >= 2 so we don't
            // surface obviously-broken single-file imports here either.
            // Unclassified small entries stay here until "Classify Album
            // Types" tags them — explicit > guessed.
            return `(MAX(is_compilation) = 0
                     AND COALESCE(MAX(album_type), 'album')
                         NOT IN ('single','ep','compilation','soundtrack')
                     AND COUNT(*) >= 2)`;
          case "compilations":
            return `(MAX(is_compilation) = 1
                     OR MAX(album_type) IN ('compilation','soundtrack'))`;
          case "singles":
            // STRICT — requires explicit MB classification. The previous
            // "track_count <= 4" fallback dragged broken single-track
            // imports in here. Now: nothing shows as Single until either
            // "Sync from Beets" or "Classify Album Types" has tagged it.
            return `(MAX(album_type) IN ('single','ep'))`;
          default:
            return null;
        }
      }).filter(Boolean);
      if (clauses.length > 0) {
        query += ` HAVING ` + clauses.join(" OR ");
      }
    }

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
