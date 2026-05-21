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

export interface DuplicateAlbumCandidate {
  /** Canonical key both variants share (lowercased, sub-stripped). */
  canonicalKey: string;
  /** Each variant album with track list + overlap stats. */
  variants: Array<{
    album: string;
    albumArtist: string;
    trackCount: number;
    year: number | null;
    discNumbers: number[];
    /** Track titles (lowercased, used for overlap calc). */
    titleSet: string[];
  }>;
  /** Highest pairwise title-overlap ratio across variants. 0..1. */
  maxOverlap: number;
  /** Pair (i, j) that produced maxOverlap. */
  bestPair: [number, number];
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

/** Strip disc suffix AND `: subtitle` / `(subtitle)` / ` - subtitle`
 *  patterns to get the most canonical base name. Used by the
 *  duplicate-album detector — "Forrest Gump: The Soundtrack" and
 *  "Forrest Gump" should collapse to the same canonical key so we can
 *  spot them as candidates for the same release.
 *
 *  NB: This is intentionally MORE aggressive than stripDiscSuffix.
 *  Don't use it for routine grouping — only for fuzzy dup detection
 *  where the track-list overlap check is the actual confirmation. */
export function stripDiscAndSubtitle(s: string): string {
  return stripDiscSuffix(s)
    .replace(/\s*:\s.+$/, "")        // "Album: Subtitle" → "Album"
    .replace(/\s*\([^)]+\)\s*$/, "")  // "Album (Subtitle)" → "Album"
    .replace(/\s*-\s+.+$/, "")        // "Album - Subtitle" → "Album"
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

/**
 * Find candidate duplicate / re-titled albums. The case to catch:
 *
 *   Forrest Gump [Disc 1]            (16 tracks)
 *   Forrest Gump [Disc 2]            (16 tracks)
 *   Forrest Gump: The Soundtrack [Disc 1]  (16 tracks, identical to Disc 1 above)
 *
 * Approach:
 *   1. Group ALL albums by stripDiscAndSubtitle(album) — pulls the
 *      three Forrest Gump variants under canonical key "forrest gump".
 *   2. For groups with >= 2 distinct full album titles, pull the track
 *      titles of each variant from the DB.
 *   3. Compute pairwise title-set overlap. Variants with > 0.7 overlap
 *      are flagged as duplicate candidates (the soundtrack [Disc 1]
 *      vs the bare [Disc 1] case).
 *
 * Returns a list of candidate groups for the runner to surface in the
 * review queue. Each group includes the pairwise overlap so the LLM
 * (or user) can judge which variant is canonical and which to drop.
 */
export function findDuplicateAlbums(opts: {
  minOverlap?: number;
  minTracks?: number;
} = {}): DuplicateAlbumCandidate[] {
  const minOverlap = opts.minOverlap ?? 0.7;
  const minTracks = opts.minTracks ?? 5;
  const db = openBeets();
  try {
    const rows = db
      .prepare(
        `SELECT album, COALESCE(albumartist, artist) as album_artist,
                COUNT(*) as track_count, MIN(year) as year,
                GROUP_CONCAT(DISTINCT disc) as disc_csv
         FROM items
         WHERE album IS NOT NULL AND album != ''
         GROUP BY album, COALESCE(albumartist, artist)
         HAVING track_count >= ?`
      )
      .all(minTracks) as Array<{
      album: string;
      album_artist: string;
      track_count: number;
      year: number | null;
      disc_csv: string | null;
    }>;

    // Bucket by canonical key.
    const buckets = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = stripDiscAndSubtitle(r.album).toLowerCase();
      if (!key) continue;
      const list = buckets.get(key) ?? [];
      list.push(r);
      buckets.set(key, list);
    }

    const candidates: DuplicateAlbumCandidate[] = [];

    for (const [canonicalKey, variants] of buckets.entries()) {
      // Need at least 2 distinct album titles to be a dup candidate.
      const distinctTitles = new Set(variants.map((v) => v.album));
      if (distinctTitles.size < 2) continue;

      // Load track titles per variant.
      const variantInfo = variants.map((v) => {
        const titles = db
          .prepare(
            `SELECT title FROM items WHERE album = ? AND COALESCE(albumartist, artist) = ?`
          )
          .all(v.album, v.album_artist) as Array<{ title: string }>;
        const titleSet = titles
          .map((t) => (t.title || "").toLowerCase().trim())
          .filter(Boolean);
        return {
          album: v.album,
          albumArtist: v.album_artist || "",
          trackCount: v.track_count,
          year: v.year,
          discNumbers: (v.disc_csv || "")
            .split(",")
            .map((d) => parseInt(d, 10))
            .filter((n) => Number.isFinite(n)),
          titleSet,
        };
      });

      // Pairwise overlap (Jaccard on title sets).
      let maxOverlap = 0;
      let bestPair: [number, number] = [0, 1];
      for (let i = 0; i < variantInfo.length; i++) {
        for (let j = i + 1; j < variantInfo.length; j++) {
          const setI = new Set(variantInfo[i].titleSet);
          const setJ = new Set(variantInfo[j].titleSet);
          const intersection = [...setI].filter((t) => setJ.has(t)).length;
          const union = setI.size + setJ.size - intersection;
          if (union === 0) continue;
          const ratio = intersection / union;
          if (ratio > maxOverlap) {
            maxOverlap = ratio;
            bestPair = [i, j];
          }
        }
      }

      if (maxOverlap >= minOverlap) {
        candidates.push({
          canonicalKey,
          variants: variantInfo,
          maxOverlap,
          bestPair,
        });
      }
    }

    // Highest-overlap first so the user sees the most obvious dups.
    candidates.sort((a, b) => b.maxOverlap - a.maxOverlap);
    return candidates;
  } finally {
    db.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule-based verdicts (PR A / v0.7.0 redesign)
//
// Each detector gets a sibling judge*() function that returns a verdict
// without consulting an LLM. The runner uses this to bypass the LLM for
// candidates whose right action is deterministic from metadata alone
// (e.g. "76 distinct artists on one album → compilation, always"). Where
// the rule is genuinely uncertain (auto=false), the runner falls back to
// the LLM path (or, in DIAG-only mode, queues the candidate for opt-in
// per-category LLM evaluation).
//
// All judge*() functions are pure — no DB writes, no spawn, no network.
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleVerdict {
  /** True = apply automatically without LLM. False = needs human/LLM. */
  auto: boolean;
  /** 0..1 — only meaningful when auto=true (then always 1.0). */
  confidence: number;
  /** Beet command args to apply when auto=true. Empty/undefined when not. */
  command?: string[];
  /** Short human-readable explanation. Shows up in logs + audit rows. */
  reasoning: string;
}

/**
 * Compilation candidates are unambiguous when many distinct artists share
 * one album and the album isn't already flagged. Threshold tuned to
 * minimise false positives — a real single-artist album rarely has
 * 8+ distinct credited artists across its tracks.
 */
export function judgeCompilation(c: CompilationCandidate): RuleVerdict {
  if (c.isFlaggedComp) {
    return { auto: false, confidence: 0, reasoning: "Already flagged as compilation." };
  }
  if ((c.currentAlbumArtist || "").toLowerCase().includes("various")) {
    return { auto: false, confidence: 0, reasoning: "Album artist already 'Various Artists'." };
  }
  if (c.distinctArtists >= 8) {
    return {
      auto: true,
      confidence: 1.0,
      command: [
        "modify", "-y",
        `album:${c.album}`,
        "albumartist=Various Artists",
        "comp=1",
      ],
      reasoning: `${c.distinctArtists} distinct track artists across ${c.trackCount} tracks — unambiguous compilation.`,
    };
  }
  return {
    auto: false,
    confidence: 0,
    reasoning: `${c.distinctArtists} distinct artists is borderline — needs human or LLM judgement.`,
  };
}

/**
 * Disc-split groups are unambiguous when every part shares the same
 * albumartist and they're clearly suffixed variants of the same base.
 * Different albumartists could mean different albums that happen to
 * share a base name (e.g. two artists each titled their album
 * "Greatest Hits") — those need human judgement.
 */
export function judgeDiscSplit(c: DiscSplitCandidate): RuleVerdict {
  if (c.parts.length < 2) {
    return { auto: false, confidence: 0, reasoning: "Only one part — not a split." };
  }
  const firstArtist = (c.parts[0].albumArtist || "").trim().toLowerCase();
  const allSameArtist =
    firstArtist.length > 0 &&
    c.parts.every((p) => (p.albumArtist || "").trim().toLowerCase() === firstArtist);
  if (!allSameArtist) {
    return {
      auto: false,
      confidence: 0,
      reasoning: "Parts have different album artists — could be unrelated albums sharing a base name.",
    };
  }
  // First-part variant's rename — runner will iterate the rest.
  return {
    auto: true,
    confidence: 1.0,
    command: [
      "modify", "-y",
      `album:${c.parts[0].album}`,
      `album=${c.baseName}`,
    ],
    reasoning: `All ${c.parts.length} parts share albumartist "${c.parts[0].albumArtist}" — safe to merge under "${c.baseName}".`,
  };
}

/**
 * Junk entries with the explicit "url-as-album" or "blank-album" reason
 * codes from findJunkEntries are safe to auto-remove from the beets DB
 * (never from disk — applyRemove strips the -d flag). Single-track
 * stubs are more ambiguous (could be a legitimately rare track) so
 * those still go through review.
 */
export function judgeJunk(c: JunkCandidate): RuleVerdict {
  if (c.reason === "url-as-album" || c.reason === "blank-album") {
    return {
      auto: true,
      confidence: 1.0,
      command: ["remove", "-y", `id:${c.itemId}`],
      reasoning: `${c.reason} — removing from beets DB (file on disk untouched).`,
    };
  }
  return {
    auto: false,
    confidence: 0,
    reasoning: `Reason "${c.reason}" requires human judgement.`,
  };
}

/**
 * Genre judgement is intentionally LLM-only. No rule can reliably guess
 * the right genre from metadata alone, and applying a wrong genre
 * across an album is more annoying than leaving the empty-or-bad state.
 * Returned for API symmetry; always auto=false.
 */
export function judgeGenre(_c: GenreCandidate): RuleVerdict {
  return {
    auto: false,
    confidence: 0,
    reasoning: "Genre needs LLM judgement — no rule can guess the right tag.",
  };
}
