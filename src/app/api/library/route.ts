import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { like, or, asc, desc, sql, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const search = params.get("search") || "";
  const sortBy = params.get("sort") || "title";
  const sortDir = params.get("dir") || "asc";
  const page = parseInt(params.get("page") || "1");
  const limit = parseInt(params.get("limit") || "50");
  const offset = (page - 1) * limit;

  let query = db.select().from(tracks).$dynamic();

  if (search) {
    const pattern = `%${search}%`;
    query = query.where(
      or(
        like(tracks.title, pattern),
        like(tracks.artist, pattern),
        like(tracks.album, pattern),
        like(tracks.genre, pattern)
      )
    );
  }

  const sortColumn =
    sortBy === "artist"
      ? tracks.artist
      : sortBy === "album"
        ? tracks.album
        : sortBy === "duration"
          ? tracks.duration
          : sortBy === "addedAt"
            ? tracks.addedAt
            : tracks.title;

  query = query.orderBy(sortDir === "desc" ? desc(sortColumn) : asc(sortColumn));
  query = query.limit(limit).offset(offset);

  const results = await query;

  // Get total count
  let countQuery = db.select({ total: count() }).from(tracks).$dynamic();
  if (search) {
    const pattern = `%${search}%`;
    countQuery = countQuery.where(
      or(
        like(tracks.title, pattern),
        like(tracks.artist, pattern),
        like(tracks.album, pattern),
        like(tracks.genre, pattern)
      )
    );
  }
  const [{ total }] = await countQuery;

  return NextResponse.json({
    tracks: results,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
