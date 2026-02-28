import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface ImportData {
  playlists: { id: number; name: string; description?: string; cover_path?: string; is_auto_generated?: number; created_at?: string; updated_at?: string }[];
  playlistTracks: { playlist_id: number; track_id: number; position: number; added_at?: string }[];
  trackRatings: { track_id: number; rating: number; rated_at?: string }[];
  listeningHistory: { track_id?: number; track_title: string; track_artist: string; source?: string; played_at?: string; duration?: number; listened_duration?: number; output_target?: string }[];
  trackLyrics: { track_id: number; content: string; format: string; source: string; fetched_at?: string }[];
  settings: { key: string; value: string }[];
  // Track ID mapping: source instance track_id → file_path
  trackMap?: Record<string, string>;
}

// Import user data from another Vynl instance
// POST with JSON body from /api/data/export, plus ?source=http://source:3101 to auto-fetch track mapping
export async function POST(request: NextRequest) {
  try {
    const sourceUrl = request.nextUrl.searchParams.get("source");
    let data: ImportData;

    if (sourceUrl) {
      // Fetch export data from source instance
      const resp = await fetch(`${sourceUrl}/api/data/export`);
      if (!resp.ok) return NextResponse.json({ error: `Failed to fetch from ${sourceUrl}` }, { status: 502 });
      data = await resp.json();

      // Also fetch track mapping (id → file_path) from source
      const tracksResp = await fetch(`${sourceUrl}/api/data/track-map`);
      if (tracksResp.ok) {
        data.trackMap = await tracksResp.json();
      }
    } else {
      data = await request.json();
    }

    const sqlite = (db as any).session?.client || (db as any).$client;

    // Build source track_id → local track_id mapping
    const idMap = new Map<number, number>();

    if (data.trackMap) {
      // Map by file_path: source track_id → file_path → local track_id
      const pathRemap = process.env.BEETS_PATH_REMAP;
      const remapRules: { from: string; to: string }[] = [];
      if (pathRemap) {
        for (const rule of pathRemap.split(";")) {
          const [from, to] = rule.split("::");
          if (from && to) remapRules.push({ from, to });
        }
      }

      for (const [sourceId, sourcePath] of Object.entries(data.trackMap)) {
        // Apply reverse remap: our remap transforms DB paths → local paths
        // Source paths are already local to that instance, we need to find ours
        let localPath = sourcePath;
        // Try to find by the path as-is, or by applying our own remap
        const localTrack = db.select({ id: tracks.id }).from(tracks)
          .where(eq(tracks.filePath, localPath)).get();

        if (localTrack) {
          idMap.set(Number(sourceId), localTrack.id);
        } else {
          // Try all remap rules to find a match
          for (const rule of remapRules) {
            const testPath = localPath.replace(rule.from, rule.to);
            const match = db.select({ id: tracks.id }).from(tracks)
              .where(eq(tracks.filePath, testPath)).get();
            if (match) {
              idMap.set(Number(sourceId), match.id);
              break;
            }
          }
        }
      }
    }

    let playlistsImported = 0;
    let ratingsImported = 0;
    let historyImported = 0;
    let lyricsImported = 0;
    let settingsImported = 0;

    // Import playlists with track remapping
    const playlistIdMap = new Map<number, number>();
    for (const pl of data.playlists || []) {
      const result = sqlite.prepare(
        `INSERT OR IGNORE INTO playlists (name, description, cover_path, is_auto_generated, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(pl.name, pl.description || null, pl.cover_path || null, pl.is_auto_generated || 0, pl.created_at || null, pl.updated_at || null);

      if (result.changes > 0) {
        playlistIdMap.set(pl.id, result.lastInsertRowid as number);
        playlistsImported++;
      }
    }

    // Import playlist tracks (remap both playlist_id and track_id)
    let playlistTracksImported = 0;
    for (const pt of data.playlistTracks || []) {
      const newPlaylistId = playlistIdMap.get(pt.playlist_id);
      const newTrackId = idMap.get(pt.track_id);
      if (newPlaylistId && newTrackId) {
        try {
          sqlite.prepare(
            `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
             VALUES (?, ?, ?, ?)`
          ).run(newPlaylistId, newTrackId, pt.position, pt.added_at || null);
          playlistTracksImported++;
        } catch { /* skip duplicates */ }
      }
    }

    // Import track ratings
    for (const tr of data.trackRatings || []) {
      const newTrackId = idMap.get(tr.track_id);
      if (newTrackId) {
        try {
          sqlite.prepare(
            `INSERT OR REPLACE INTO track_ratings (track_id, rating, rated_at) VALUES (?, ?, ?)`
          ).run(newTrackId, tr.rating, tr.rated_at || null);
          ratingsImported++;
        } catch { /* skip */ }
      }
    }

    // Import listening history (no track_id remapping needed — uses title/artist)
    for (const lh of data.listeningHistory || []) {
      const newTrackId = lh.track_id ? idMap.get(lh.track_id) : null;
      try {
        sqlite.prepare(
          `INSERT INTO listening_history (track_id, track_title, track_artist, source, played_at, duration, listened_duration, output_target)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(newTrackId || null, lh.track_title, lh.track_artist, lh.source || "local", lh.played_at || null, lh.duration || null, lh.listened_duration || null, lh.output_target || "browser");
        historyImported++;
      } catch { /* skip */ }
    }

    // Import lyrics
    for (const tl of data.trackLyrics || []) {
      const newTrackId = idMap.get(tl.track_id);
      if (newTrackId) {
        try {
          sqlite.prepare(
            `INSERT OR REPLACE INTO track_lyrics (track_id, content, format, source, fetched_at)
             VALUES (?, ?, ?, ?, ?)`
          ).run(newTrackId, tl.content, tl.format, tl.source, tl.fetched_at || null);
          lyricsImported++;
        } catch { /* skip */ }
      }
    }

    // Import settings
    for (const s of data.settings || []) {
      try {
        sqlite.prepare(
          `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`
        ).run(s.key, s.value);
        settingsImported++;
      } catch { /* skip */ }
    }

    return NextResponse.json({
      tracksMapped: idMap.size,
      playlistsImported,
      playlistTracksImported,
      ratingsImported,
      historyImported,
      lyricsImported,
      settingsImported,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Import failed", details: String(err) },
      { status: 500 }
    );
  }
}
