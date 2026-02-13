import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "vynl.db");

export async function GET() {
  try {
    const bdb = new Database(DB_PATH);

    const totalTracks = (
      bdb.prepare("SELECT COUNT(*) as c FROM tracks WHERE source = 'local'").get() as { c: number }
    ).c;

    const withLyrics = (
      bdb.prepare("SELECT COUNT(*) as c FROM track_lyrics").get() as { c: number }
    ).c;

    const syncedLyrics = (
      bdb.prepare("SELECT COUNT(*) as c FROM track_lyrics WHERE format = 'lrc'").get() as { c: number }
    ).c;

    const plainLyrics = (
      bdb.prepare("SELECT COUNT(*) as c FROM track_lyrics WHERE format = 'plain'").get() as { c: number }
    ).c;

    const bySource = bdb
      .prepare("SELECT source, COUNT(*) as c FROM track_lyrics GROUP BY source")
      .all() as { source: string; c: number }[];

    bdb.close();

    const coverage = totalTracks > 0 ? ((withLyrics / totalTracks) * 100).toFixed(1) : "0.0";

    return NextResponse.json({
      totalTracks,
      withLyrics,
      syncedLyrics,
      plainLyrics,
      missing: totalTracks - withLyrics,
      coverage: `${coverage}%`,
      bySource: Object.fromEntries(bySource.map((r) => [r.source, r.c])),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get lyrics stats", details: String(err) },
      { status: 500 }
    );
  }
}
