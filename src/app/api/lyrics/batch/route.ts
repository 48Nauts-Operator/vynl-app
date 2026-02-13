import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import {
  fetchEmbeddedLyrics,
  fetchFromLRCLIB,
  saveLyrics,
} from "@/lib/lyrics";

const DB_PATH = path.join(process.cwd(), "vynl.db");

interface BatchJob {
  status: "running" | "complete" | "cancelled" | "error";
  total: number;
  processed: number;
  found: number;
  notFound: number;
  errors: number;
  startedAt: number;
  completedAt?: number;
  currentTrack?: string;
}

// Persist on globalThis for HMR survival
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (_g.__vynl_lyricsBatchJob === undefined) _g.__vynl_lyricsBatchJob = null;

const g = {
  get job(): BatchJob | null { return _g.__vynl_lyricsBatchJob; },
  set job(v: BatchJob | null) { _g.__vynl_lyricsBatchJob = v; },
};

const LRCLIB_DELAY_MS = 150; // Rate limit: ~6-7 requests/sec

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBatchFetch() {
  const job = g.job;
  if (!job) return;

  try {
    const bdb = new Database(DB_PATH);

    // Find all local tracks that don't have cached lyrics yet
    const tracks = bdb
      .prepare(
        `SELECT t.id, t.title, t.artist, t.album, t.duration, t.file_path
         FROM tracks t
         LEFT JOIN track_lyrics tl ON tl.track_id = t.id
         WHERE t.source = 'local' AND tl.id IS NULL
         ORDER BY t.play_count DESC, t.id ASC`
      )
      .all() as {
        id: number;
        title: string;
        artist: string;
        album: string;
        duration: number;
        file_path: string;
      }[];

    bdb.close();

    job.total = tracks.length;

    for (const track of tracks) {
      if (job.status === "cancelled") break;

      job.currentTrack = `${track.artist} - ${track.title}`;
      job.processed++;

      let found = false;

      // 1. Try embedded lyrics
      if (track.file_path) {
        try {
          const embedded = await fetchEmbeddedLyrics(track.file_path);
          if (embedded.syncedLyrics) {
            saveLyrics(track.id, embedded.syncedLyrics, "lrc", "embedded");
            found = true;
          } else if (embedded.plainLyrics) {
            saveLyrics(track.id, embedded.plainLyrics, "plain", "embedded");
            found = true;
          }
        } catch {
          // Skip embedded read errors
        }
      }

      // 2. Try LRCLIB (if not found in embedded)
      if (!found && track.artist && track.title) {
        try {
          const lrclib = await fetchFromLRCLIB(
            track.artist,
            track.title,
            track.album || undefined,
            track.duration > 0 ? track.duration : undefined
          );

          if (lrclib?.syncedLyrics) {
            saveLyrics(track.id, lrclib.syncedLyrics, "lrc", "lrclib");
            found = true;
          } else if (lrclib?.plainLyrics) {
            saveLyrics(track.id, lrclib.plainLyrics, "plain", "lrclib");
            found = true;
          }

          // Rate limit LRCLIB requests
          await sleep(LRCLIB_DELAY_MS);
        } catch {
          job.errors++;
        }
      }

      if (found) {
        job.found++;
      } else {
        job.notFound++;
      }
    }

    job.status = job.status === "cancelled" ? "cancelled" : "complete";
    job.completedAt = Date.now();
    job.currentTrack = undefined;
  } catch (err) {
    if (g.job) {
      g.job.status = "error";
      g.job.completedAt = Date.now();
    }
    console.error("Batch lyrics error:", err);
  }
}

/** POST — start a batch lyrics fetch job */
export async function POST() {
  if (g.job?.status === "running") {
    return NextResponse.json(
      { error: "A lyrics batch job is already running", ...g.job },
      { status: 409 }
    );
  }

  g.job = {
    status: "running",
    total: 0,
    processed: 0,
    found: 0,
    notFound: 0,
    errors: 0,
    startedAt: Date.now(),
  };

  // Fire and forget
  runBatchFetch();

  return NextResponse.json({ message: "Batch lyrics fetch started", status: "running" });
}

/** GET — poll batch job status */
export async function GET() {
  if (!g.job) {
    return NextResponse.json({ status: "idle" });
  }

  return NextResponse.json({
    status: g.job.status,
    total: g.job.total,
    processed: g.job.processed,
    found: g.job.found,
    notFound: g.job.notFound,
    errors: g.job.errors,
    currentTrack: g.job.currentTrack,
    startedAt: g.job.startedAt,
    completedAt: g.job.completedAt,
  });
}

/** DELETE — cancel the batch job */
export async function DELETE() {
  if (!g.job || g.job.status !== "running") {
    return NextResponse.json({ error: "No running batch job" }, { status: 400 });
  }

  g.job.status = "cancelled";
  return NextResponse.json({ message: "Cancellation requested" });
}
