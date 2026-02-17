// Metadata enrichment background job
// Phase 1: Re-read embedded metadata from audio files (fast, ~50ms/track)
// Phase 2: Query MusicBrainz API for remaining gaps (1 req/sec rate limit)

import { db } from "@/lib/db";

export interface MetadataEnrichJob {
  status: "running" | "complete" | "cancelled" | "error";
  phase: "embedded" | "musicbrainz" | "complete";
  phaseDetail: string;
  totalTracks: number;
  processedTracks: number;
  embeddedFound: number;
  mbQueried: number;
  mbFound: number;
  gapsRemaining: number;
  errors: number;
  startedAt: string;
  error?: string;
}

// globalThis pattern to persist across HMR
const _g = globalThis as typeof globalThis & {
  __vynl_enrichJob?: MetadataEnrichJob | null;
  __vynl_enrichCancel?: boolean;
};

export function getEnrichmentStatus(): MetadataEnrichJob | null {
  return _g.__vynl_enrichJob ?? null;
}

export function cancelEnrichment(): void {
  _g.__vynl_enrichCancel = true;
}

interface GapTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string | null;
  file_path: string;
}

export async function startEnrichment(): Promise<void> {
  if (_g.__vynl_enrichJob?.status === "running") return;

  const sqlite = (db as any).session?.client || (db as any).$client;
  _g.__vynl_enrichCancel = false;

  // Find tracks missing year or genre
  const gaps: GapTrack[] = sqlite
    .prepare(
      `SELECT id, title, artist, album, year, genre, file_path
       FROM tracks
       WHERE source = 'local' AND (year IS NULL OR year = 0 OR genre IS NULL OR genre = '')
       ORDER BY album, track_number`
    )
    .all();

  const job: MetadataEnrichJob = {
    status: "running",
    phase: "embedded",
    phaseDetail: "Reading embedded metadata from audio files...",
    totalTracks: gaps.length,
    processedTracks: 0,
    embeddedFound: 0,
    mbQueried: 0,
    mbFound: 0,
    gapsRemaining: gaps.length,
    errors: 0,
    startedAt: new Date().toISOString(),
  };
  _g.__vynl_enrichJob = job;

  if (gaps.length === 0) {
    job.status = "complete";
    job.phase = "complete";
    job.phaseDetail = "No tracks need enrichment";
    return;
  }

  // Run async without blocking
  runEnrichment(gaps, job, sqlite).catch((err) => {
    job.status = "error";
    job.error = String(err);
  });
}

async function runEnrichment(
  gaps: GapTrack[],
  job: MetadataEnrichJob,
  sqlite: any
): Promise<void> {
  // ── Phase 1: Embedded metadata ──
  const { parseFile } = await import("music-metadata");
  const updateStmt = sqlite.prepare(
    `UPDATE tracks SET year = COALESCE(?, year), genre = COALESCE(?, genre) WHERE id = ?`
  );

  const remainingAfterEmbedded: GapTrack[] = [];

  for (const track of gaps) {
    if (_g.__vynl_enrichCancel) {
      job.status = "cancelled";
      job.phaseDetail = "Cancelled by user";
      return;
    }

    try {
      const meta = await parseFile(track.file_path, { skipCovers: true });
      const embeddedYear = meta.common.year ?? null;
      const embeddedGenre = meta.common.genre?.[0] ?? null;

      const needsYear = !track.year || track.year === 0;
      const needsGenre = !track.genre || track.genre === "";
      const newYear = needsYear && embeddedYear ? embeddedYear : null;
      const newGenre = needsGenre && embeddedGenre ? embeddedGenre : null;

      if (newYear || newGenre) {
        updateStmt.run(newYear, newGenre, track.id);
        job.embeddedFound++;
      }

      // Check if still has gaps after update
      const stillMissingYear = needsYear && !newYear;
      const stillMissingGenre = needsGenre && !newGenre;
      if (stillMissingYear || stillMissingGenre) {
        remainingAfterEmbedded.push({
          ...track,
          year: newYear ?? track.year,
          genre: newGenre ?? track.genre,
        });
      }
    } catch {
      // File not accessible or unreadable — still a gap
      remainingAfterEmbedded.push(track);
      job.errors++;
    }

    job.processedTracks++;
    job.phaseDetail = `Phase 1: ${job.processedTracks}/${gaps.length} files checked, ${job.embeddedFound} found`;
  }

  // ── Phase 2: MusicBrainz API ──
  if (_g.__vynl_enrichCancel) {
    job.status = "cancelled";
    job.phaseDetail = "Cancelled by user";
    return;
  }

  if (remainingAfterEmbedded.length === 0) {
    job.status = "complete";
    job.phase = "complete";
    job.gapsRemaining = 0;
    job.phaseDetail = `Done! ${job.embeddedFound} from files, no MusicBrainz needed`;
    return;
  }

  job.phase = "musicbrainz";
  job.phaseDetail = `Phase 2: Querying MusicBrainz for ${remainingAfterEmbedded.length} remaining tracks...`;

  for (const track of remainingAfterEmbedded) {
    if (_g.__vynl_enrichCancel) {
      job.status = "cancelled";
      job.phaseDetail = "Cancelled by user";
      return;
    }

    try {
      const result = await queryMusicBrainz(track.title, track.artist);
      job.mbQueried++;

      if (result) {
        const needsYear = !track.year || track.year === 0;
        const needsGenre = !track.genre || track.genre === "";
        const newYear = needsYear && result.year ? result.year : null;
        const newGenre = needsGenre && result.genre ? result.genre : null;

        if (newYear || newGenre) {
          updateStmt.run(newYear, newGenre, track.id);
          job.mbFound++;
        }
      }
    } catch {
      job.errors++;
    }

    job.phaseDetail = `Phase 2: ${job.mbQueried}/${remainingAfterEmbedded.length} MusicBrainz queries, ${job.mbFound} found`;

    // Rate limit: 1 request per second
    await new Promise((r) => setTimeout(r, 1100));
  }

  // Final gap count
  const finalGaps: { cnt: number } = sqlite
    .prepare(
      `SELECT COUNT(*) as cnt FROM tracks
       WHERE source = 'local' AND (year IS NULL OR year = 0 OR genre IS NULL OR genre = '')`
    )
    .get();

  job.gapsRemaining = finalGaps.cnt;
  job.status = "complete";
  job.phase = "complete";
  job.phaseDetail = `Done! ${job.embeddedFound} from files, ${job.mbFound} from MusicBrainz, ${job.gapsRemaining} still missing`;
}

interface MbResult {
  year: number | null;
  genre: string | null;
}

async function queryMusicBrainz(
  title: string,
  artist: string
): Promise<MbResult | null> {
  const query = encodeURIComponent(
    `recording:"${title}" AND artist:"${artist}"`
  );
  const url = `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=1`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Vynl/1.0 (https://github.com/vynl-music)",
      Accept: "application/json",
    },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const recording = data.recordings?.[0];
  if (!recording) return null;

  // Extract year from first release date
  let year: number | null = null;
  const dateStr = recording.releases?.[0]?.date;
  if (dateStr) {
    const parsed = parseInt(dateStr.substring(0, 4), 10);
    if (!isNaN(parsed) && parsed > 1900 && parsed < 2100) {
      year = parsed;
    }
  }

  // Extract genre from tags
  let genre: string | null = null;
  const tag = recording.tags?.[0]?.name;
  if (tag) {
    // Capitalize first letter of each word
    genre = tag.replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  return year || genre ? { year, genre } : null;
}

/** Get current gap counts for the Settings UI badges */
export function getMetadataGaps(): {
  missingYear: number;
  missingGenre: number;
  totalTracks: number;
} {
  const sqlite = (db as any).session?.client || (db as any).$client;
  const row = sqlite
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN year IS NULL OR year = 0 THEN 1 ELSE 0 END) as missing_year,
         SUM(CASE WHEN genre IS NULL OR genre = '' THEN 1 ELSE 0 END) as missing_genre
       FROM tracks WHERE source = 'local'`
    )
    .get() as { total: number; missing_year: number; missing_genre: number };

  return {
    totalTracks: row.total,
    missingYear: row.missing_year,
    missingGenre: row.missing_genre,
  };
}
