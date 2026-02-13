import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import Database from "better-sqlite3";

function getBeetsDbPath(): string {
  return process.env.BEETS_DB_PATH || path.join(os.homedir(), ".config", "beets", "library.db");
}

interface DupCleanJob {
  status: "running" | "complete" | "cancelled" | "error";
  total: number;
  processed: number;
  removed: number;
  errors: number;
  freedBytes: number;
  currentFile?: string;
  keepFormat: string;
  startedAt: number;
  completedAt?: number;
}

// Persist on globalThis for HMR survival
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (_g.__vynl_dupCleanJob === undefined) _g.__vynl_dupCleanJob = null;

const g = {
  get job(): DupCleanJob | null { return _g.__vynl_dupCleanJob; },
  set job(v: DupCleanJob | null) { _g.__vynl_dupCleanJob = v; },
};

async function runDupClean() {
  const job = g.job;
  if (!job) return;

  try {
    const keepExt = job.keepFormat === "m4a" ? ".m4a" : ".mp3";
    const removeExt = job.keepFormat === "m4a" ? ".mp3" : ".m4a";

    // Find all duplicate format pairs
    const formatDupes = db.all(sql`
      SELECT t1.id as id1, t2.id as id2,
             t1.title as title, t1.album as album,
             t1.file_path as path1, t2.file_path as path2,
             t1.file_size as size1, t2.file_size as size2
      FROM tracks t1
      JOIN tracks t2 ON t1.album = t2.album
        AND t1.track_number = t2.track_number
        AND t1.title = t2.title
        AND t1.id < t2.id
      WHERE (t1.file_path LIKE '%.m4a' AND t2.file_path LIKE '%.mp3')
         OR (t1.file_path LIKE '%.mp3' AND t2.file_path LIKE '%.m4a')
    `) as Array<{
      id1: number; id2: number; title: string; album: string;
      path1: string; path2: string; size1: number; size2: number;
    }>;

    job.total = formatDupes.length;

    for (const dup of formatDupes) {
      if (job.status === "cancelled") break;

      const removeId = dup.path1.endsWith(removeExt) ? dup.id1 : dup.id2;
      const removePath = dup.path1.endsWith(removeExt) ? dup.path1 : dup.path2;
      const removeSize = dup.path1.endsWith(removeExt) ? dup.size1 : dup.size2;

      job.currentFile = `${dup.album} — ${dup.title}`;
      job.processed++;

      try {
        // Delete file from disk
        if (fs.existsSync(removePath)) {
          fs.unlinkSync(removePath);
          job.freedBytes += removeSize || 0;
        }

        // Remove from Vynl DB
        db.run(sql`DELETE FROM tracks WHERE id = ${removeId}`);

        // Remove from beets DB
        try {
          const beetsDbPath = getBeetsDbPath();
          if (fs.existsSync(beetsDbPath)) {
            const beetsDb = new Database(beetsDbPath);
            beetsDb.prepare(`DELETE FROM items WHERE path = ?`).run(Buffer.from(removePath, "utf-8"));
            beetsDb.close();
          }
        } catch {
          // Non-fatal beets DB error
        }

        job.removed++;
      } catch {
        job.errors++;
      }

      // Small yield to avoid blocking the event loop
      if (job.processed % 50 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    job.status = job.status === "cancelled" ? "cancelled" : "complete";
    job.completedAt = Date.now();
    job.currentFile = undefined;
  } catch (err) {
    if (g.job) {
      g.job.status = "error";
      g.job.completedAt = Date.now();
    }
    console.error("Duplicate clean error:", err);
  }
}

/** POST — start a duplicate clean job */
export async function POST(request: NextRequest) {
  if (g.job?.status === "running") {
    return NextResponse.json(
      { error: "A duplicate clean job is already running", ...g.job },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const keepFormat = body.keep || "m4a";

  g.job = {
    status: "running",
    total: 0,
    processed: 0,
    removed: 0,
    errors: 0,
    freedBytes: 0,
    keepFormat,
    startedAt: Date.now(),
  };

  // Fire and forget
  runDupClean();

  return NextResponse.json({ message: "Duplicate clean started", status: "running" });
}

/** GET — poll job status */
export async function GET() {
  if (!g.job) {
    return NextResponse.json({ status: "idle" });
  }

  return NextResponse.json({
    status: g.job.status,
    total: g.job.total,
    processed: g.job.processed,
    removed: g.job.removed,
    errors: g.job.errors,
    freedBytes: g.job.freedBytes,
    currentFile: g.job.currentFile,
    keepFormat: g.job.keepFormat,
    startedAt: g.job.startedAt,
    completedAt: g.job.completedAt,
  });
}

/** DELETE — cancel the job */
export async function DELETE() {
  if (!g.job || g.job.status !== "running") {
    return NextResponse.json({ error: "No running duplicate clean job" }, { status: 400 });
  }

  g.job.status = "cancelled";
  return NextResponse.json({ message: "Cancellation requested" });
}
