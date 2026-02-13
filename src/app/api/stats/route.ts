import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks, trackRatings } from "@/lib/db/schema";
import { eq, desc, sql, asc, lte } from "drizzle-orm";

export async function GET() {
  // Best rated albums: avg rating of tracks, min 3 rated tracks
  const bestRatedAlbums = db.all(sql`
    SELECT
      t.album,
      t.album_artist AS albumArtist,
      t.cover_path AS coverPath,
      ROUND(AVG(r.rating), 2) AS avgRating,
      COUNT(r.id) AS ratedTracks,
      SUM(t.play_count) AS totalPlays
    FROM track_ratings r
    JOIN tracks t ON t.id = r.track_id
    GROUP BY t.album, t.album_artist
    HAVING COUNT(r.id) >= 3
    ORDER BY AVG(r.rating) DESC, COUNT(r.id) DESC
    LIMIT 50
  `);

  // Best rated tracks
  const bestRatedTracks = db
    .select({
      id: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      album: tracks.album,
      albumArtist: tracks.albumArtist,
      coverPath: tracks.coverPath,
      playCount: tracks.playCount,
      rating: trackRatings.rating,
    })
    .from(trackRatings)
    .innerJoin(tracks, eq(tracks.id, trackRatings.trackId))
    .orderBy(desc(trackRatings.rating), desc(tracks.playCount))
    .limit(20)
    .all();

  // Most played tracks
  const mostPlayedTracks = db
    .select({
      id: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      album: tracks.album,
      albumArtist: tracks.albumArtist,
      coverPath: tracks.coverPath,
      playCount: tracks.playCount,
    })
    .from(tracks)
    .orderBy(desc(tracks.playCount))
    .limit(20)
    .all();

  // Most played albums
  const mostPlayedAlbums = db.all(sql`
    SELECT
      t.album,
      t.album_artist AS albumArtist,
      t.cover_path AS coverPath,
      SUM(t.play_count) AS totalPlays,
      COUNT(t.id) AS trackCount
    FROM tracks t
    WHERE t.play_count > 0
    GROUP BY t.album, t.album_artist
    ORDER BY SUM(t.play_count) DESC
    LIMIT 20
  `);

  // Worst tracks: rating 1 or 2
  const worstTracks = db
    .select({
      id: tracks.id,
      title: tracks.title,
      artist: tracks.artist,
      album: tracks.album,
      albumArtist: tracks.albumArtist,
      coverPath: tracks.coverPath,
      playCount: tracks.playCount,
      rating: trackRatings.rating,
    })
    .from(trackRatings)
    .innerJoin(tracks, eq(tracks.id, trackRatings.trackId))
    .where(lte(trackRatings.rating, 2))
    .orderBy(asc(trackRatings.rating), asc(tracks.playCount))
    .limit(50)
    .all();

  // Summary stats
  const summaryRow = db.get(sql`
    SELECT
      (SELECT COUNT(*) FROM track_ratings) AS totalRated,
      (SELECT ROUND(AVG(rating), 2) FROM track_ratings) AS avgRating,
      (SELECT SUM(play_count) FROM tracks) AS totalPlays,
      (SELECT ROUND(SUM(duration) / 3600.0, 1) FROM listening_history) AS listeningHours,
      (SELECT COUNT(*) FROM tracks) AS totalTracks,
      (SELECT ROUND(SUM(duration) / 3600.0, 1) FROM tracks) AS libraryHours
  `) as { totalRated: number; avgRating: number | null; totalPlays: number; listeningHours: number | null; totalTracks: number; libraryHours: number | null };

  return NextResponse.json({
    bestRatedAlbums,
    bestRatedTracks,
    mostPlayedTracks,
    mostPlayedAlbums,
    worstTracks,
    summary: {
      totalTracks: summaryRow?.totalTracks ?? 0,
      libraryHours: summaryRow?.libraryHours ?? 0,
      totalRated: summaryRow?.totalRated ?? 0,
      avgRating: summaryRow?.avgRating ?? 0,
      totalPlays: summaryRow?.totalPlays ?? 0,
      listeningHours: summaryRow?.listeningHours ?? 0,
    },
  });
}
