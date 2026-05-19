// BeetsAI Doctor — detector functions.
//
// Each detector reads from the beets library DB and returns a list of
// candidate findings. Detectors do NOT make any LLM calls or apply any
// fixes — the runner does that. This module is pure data extraction.

import Database from "better-sqlite3";
import { existsSync } from "fs";

// Beets library DB path. In Docker the container mounts the host DB at
// /music/library.db. Local dev points BEETS_DB_PATH at the real file
// (e.g. /Volumes/Music/library.db on the host that ran the original
// beets import).
const BEETS_DB = process.env.BEETS_DB_PATH || "/music/library.db";

function assertBeetsDb() {
  if (!existsSync(BEETS_DB)) {
    throw new Error(
      `Beets library DB not found at ${BEETS_DB}. Set BEETS_DB_PATH env var to the actual path (e.g. /Volumes/Music/library.db on Mac dev).`
    );
  }
}

export interface CompilationCandidate {
  album: string;
  currentAlbumArtist: string;
  trackCount: number;
  distinctArtists: number;
  isFlaggedComp: boolean;
  sampleArtists: string[]; // up to 8 distinct artist names
  sampleTitles: string[]; // up to 8 track titles
  year: number | null;
}

export interface DiscSplitCandidate {
  baseName: string;
  parts: Array<{
    album: string;
    albumArtist: string;
    trackCount: number;
    year: number | null;
  }>;
}

export interface JunkCandidate {
  itemId: number;
  album: string | null;        // probably "", null, or garbage
  artist: string;
  title: string;
  path: string;
  reason: "blank-album" | "url-as-album" | "single-stub";
}

export interface GenreCandidate {
  album: string;
  albumArtist: string;
  trackCount: number;
  currentGenres: string[];     // distinct genre values across tracks
  sampleArtists: string[];
  sampleTitles: string[];
  year: number | null;
}

function openBeets() {
  assertBeetsDb();
  return new Database(BEETS_DB, { readonly: true });
}

function decodePath(v: unknown): string {
  if (typeof v === "string") return v;
  if (Buffer.isBuffer(v)) return v.toString("utf-8");
  return "";
}

/** Strip disc / volume / CD / Pt. suffixes to get the base album name. */
export function stripDiscSuffix(s: string): string {
  return s
    .replace(/\s*[\[\(]\s*(disc|cd|disk|part|pt\.?)\s*\d+\s*[\]\)]/gi, "")
    .replace(/\s*-\s*(disc|cd|disk)\s*\d+\s*$/gi, "")
    .replace(/,?\s*(vol\.?|volume)\s*\d+\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compilation candidates: many distinct track artists, no Various Artists
 *  or comp flag set. Today's Urban Kiss case. */
export function findCompilationCandidates(opts: {
  minDistinctArtists?: number;
  minTracks?: number;
} = {}): CompilationCandidate[] {
  const minDistinctArtists = opts.minDistinctArtists ?? 4;
  const minTracks = opts.minTracks ?? 5;
  const db = openBeets();
  try {
    const rows = db
      .prepare(
        `
        SELECT
          album,
          MAX(albumartist) as album_artist,
          MAX(comp) as comp_flag,
          COUNT(*) as track_count,
          COUNT(DISTINCT artist) as distinct_artists,
          MIN(year) as year
        FROM items
        WHERE album IS NOT NULL AND album != '' AND album != 'Unknown Album'
        GROUP BY album
        HAVING distinct_artists >= ? AND track_count >= ?
        ORDER BY distinct_artists DESC, track_count DESC
      `
      )
      .all(minDistinctArtists, minTracks) as Array<{
      album: string;
      album_artist: string | null;
      comp_flag: number | null;
      track_count: number;
      distinct_artists: number;
      year: number | null;
    }>;

    return rows
      .filter((r) => {
        // Skip ones already flagged as compilations or set to Various Artists.
        if (r.comp_flag === 1) return false;
        if ((r.album_artist || "").toLowerCase().includes("various")) return false;
        return true;
      })
      .map((r) => {
        // Pull a few sample artists / titles for the LLM prompt context.
        const samples = db
          .prepare(
            `SELECT DISTINCT artist FROM items WHERE album = ? LIMIT 8`
          )
          .all(r.album) as Array<{ artist: string }>;
        const titles = db
          .prepare(
            `SELECT title FROM items WHERE album = ? LIMIT 8`
          )
          .all(r.album) as Array<{ title: string }>;

        return {
          album: r.album,
          currentAlbumArtist: r.album_artist || "",
          trackCount: r.track_count,
          distinctArtists: r.distinct_artists,
          isFlaggedComp: r.comp_flag === 1,
          sampleArtists: samples.map((s) => s.artist).filter(Boolean),
          sampleTitles: titles.map((t) => t.title).filter(Boolean),
          year: r.year,
        };
      });
  } finally {
    db.close();
  }
}

/** Disc / volume / part splits. Today's `Until The End Of Time` + `[Disc 2]`
 *  case. Groups albums whose stripped base name matches across multiple
 *  rows (i.e. the user has actual variants on disk, not just one entry). */
export function findDiscSplits(): DiscSplitCandidate[] {
  const db = openBeets();
  try {
    const rows = db
      .prepare(
        `
        SELECT
          album,
          MAX(albumartist) as album_artist,
          COUNT(*) as track_count,
          MIN(year) as year
        FROM items
        WHERE album IS NOT NULL AND album != ''
        GROUP BY album
      `
      )
      .all() as Array<{
      album: string;
      album_artist: string | null;
      track_count: number;
      year: number | null;
    }>;

    // Group by stripped base name + album artist (same release if both match).
    const byBase = new Map<
      string,
      Array<{ album: string; albumArtist: string; trackCount: number; year: number | null }>
    >();
    for (const r of rows) {
      const base = stripDiscSuffix(r.album).toLowerCase();
      const list = byBase.get(base) ?? [];
      list.push({
        album: r.album,
        albumArtist: r.album_artist || "",
        trackCount: r.track_count,
        year: r.year,
      });
      byBase.set(base, list);
    }

    const candidates: DiscSplitCandidate[] = [];
    for (const [, parts] of byBase.entries()) {
      if (parts.length < 2) continue;
      // Skip if all entries have the SAME album name (just dupes, not splits).
      const distinct = new Set(parts.map((p) => p.album));
      if (distinct.size < 2) continue;
      const baseName = stripDiscSuffix(parts[0].album);
      candidates.push({ baseName, parts });
    }
    return candidates;
  } finally {
    db.close();
  }
}

/** Orphan / broken metadata entries: blank album, URL stored as album,
 *  one-track singleton stubs. The runner sends each one to the LLM which
 *  decides delete vs rename vs leave-alone. Conservative scope — we
 *  pull at most 200 candidates to keep the LLM batch sane. */
export function findJunkEntries(): JunkCandidate[] {
  const db = openBeets();
  try {
    const rows = db
      .prepare(
        `
        SELECT id, album, artist, title, path
        FROM items
        WHERE (album IS NULL OR album = '' OR album LIKE 'http%' OR album LIKE 'www.%')
        LIMIT 200
        `
      )
      .all() as Array<{
      id: number;
      album: string | null;
      artist: string;
      title: string;
      path: Buffer | string;
    }>;

    return rows.map((r) => {
      let reason: JunkCandidate["reason"] = "blank-album";
      if (r.album && (r.album.startsWith("http") || r.album.startsWith("www."))) {
        reason = "url-as-album";
      } else if (!r.album || r.album.trim() === "") {
        reason = "blank-album";
      } else {
        reason = "single-stub";
      }
      return {
        itemId: r.id,
        album: r.album,
        artist: r.artist || "",
        title: r.title || "",
        path: decodePath(r.path),
        reason,
      };
    });
  } finally {
    db.close();
  }
}

/** Albums with empty or potentially wrong genres. We pull the candidates
 *  here but the LLM does the actual judgement (some artists span genres,
 *  some albums are intentionally cross-genre). Limited to 300 by default
 *  to keep scan time bounded; runner can override via opts. */
export function findGenreIssues(opts: {
  includeEmpty?: boolean;
  includeAll?: boolean;
  limit?: number;
} = {}): GenreCandidate[] {
  const includeEmpty = opts.includeEmpty ?? true;
  const includeAll = opts.includeAll ?? false;
  const limit = opts.limit ?? 300;
  const db = openBeets();
  try {
    // Group by album+albumartist to mirror how the user sees albums.
    const where = includeAll
      ? "1=1"
      : includeEmpty
        ? "(genres IS NULL OR genres = '' OR LENGTH(TRIM(genres)) = 0)"
        : "1=1";
    // Group by album NAME ONLY. Previously grouped by (album, albumartist)
    // which produced N rows per album for un-flagged compilations where
    // each track had a different albumartist (4x "Gloria" bug). Same fix
    // class as the disc-split 60x bug we fixed earlier — dedup at the
    // SQL layer so the LLM never sees the same album twice.
    const rows = db
      .prepare(
        `
        SELECT
          album,
          (SELECT COALESCE(albumartist, artist) FROM items i2
             WHERE i2.album = items.album
             ORDER BY i2.id LIMIT 1) as album_artist,
          COUNT(*) as track_count,
          MIN(year) as year,
          GROUP_CONCAT(DISTINCT genres) as all_genres
        FROM items
        WHERE album IS NOT NULL AND album != ''
          AND id IN (
            SELECT id FROM items WHERE ${where}
          )
        GROUP BY album
        ORDER BY track_count DESC
        LIMIT ?
        `
      )
      .all(limit) as Array<{
      album: string;
      album_artist: string;
      track_count: number;
      year: number | null;
      all_genres: string | null;
    }>;

    return rows.map((r) => {
      const samples = db
        .prepare(
          `SELECT DISTINCT artist FROM items WHERE album = ? LIMIT 5`
        )
        .all(r.album) as Array<{ artist: string }>;
      const titles = db
        .prepare(
          `SELECT title FROM items WHERE album = ? LIMIT 5`
        )
        .all(r.album) as Array<{ title: string }>;
      const currentGenres = (r.all_genres || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        album: r.album,
        albumArtist: r.album_artist || "",
        trackCount: r.track_count,
        currentGenres,
        sampleArtists: samples.map((s) => s.artist).filter(Boolean),
        sampleTitles: titles.map((t) => t.title).filter(Boolean),
        year: r.year,
      };
    });
  } finally {
    db.close();
  }
}

// Silence unused-decode-path warning for now — used by future detectors that
// will need to surface file paths in LLM context.
export const _decodePath = decodePath;
