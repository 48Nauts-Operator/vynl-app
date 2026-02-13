/**
 * spotDL download endpoint for wishlist items.
 * Downloads Spotify tracks using spotDL CLI tool.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wishList } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface DownloadJob {
  status: "idle" | "running" | "complete" | "error";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentTrack?: string;
  error?: string;
}

const _g = globalThis as typeof globalThis & {
  __vynl_spotdlJob?: DownloadJob | null;
};

function getJob(): DownloadJob {
  return _g.__vynl_spotdlJob || { status: "idle", total: 0, processed: 0, succeeded: 0, failed: 0 };
}

/** POST — start downloading pending wishlist items */
export async function POST(request: NextRequest) {
  const existing = getJob();
  if (existing.status === "running") {
    return NextResponse.json({ error: "Download already running" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: number[] = body.ids || []; // Specific IDs, or empty = all pending

  const outputDir = process.env.MUSIC_LIBRARY_PATH || process.cwd();

  // Get items to download
  let items;
  if (ids.length > 0) {
    items = ids.map((id) =>
      db.select().from(wishList).where(eq(wishList.id, id)).get()
    ).filter(Boolean);
  } else {
    items = db.select().from(wishList)
      .where(eq(wishList.status, "pending"))
      .all();
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "No items to download" }, { status: 400 });
  }

  const job: DownloadJob = {
    status: "running",
    total: items.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
  };
  _g.__vynl_spotdlJob = job;

  // Run downloads in background
  (async () => {
    for (const item of items) {
      if (job.status !== "running") break;
      if (!item || !item.spotifyUri) {
        job.processed++;
        job.failed++;
        continue;
      }

      job.currentTrack = `${item.seedArtist} — ${item.seedTitle}`;

      try {
        db.update(wishList)
          .set({ status: "downloading" })
          .where(eq(wishList.id, item.id))
          .run();

        await execFileAsync("spotdl", [
          "download",
          item.spotifyUri,
          "--output", outputDir,
        ], { timeout: 120000 });

        db.update(wishList)
          .set({ status: "completed" })
          .where(eq(wishList.id, item.id))
          .run();

        job.succeeded++;
      } catch (err) {
        console.error(`spotDL download failed for ${item.spotifyUri}:`, err);
        db.update(wishList)
          .set({ status: "pending" }) // Reset to pending on failure
          .where(eq(wishList.id, item.id))
          .run();
        job.failed++;
      }

      job.processed++;
    }

    job.status = "complete";
    job.currentTrack = undefined;
  })();

  return NextResponse.json({ started: true, total: items.length });
}

/** GET — poll download status */
export async function GET() {
  return NextResponse.json(getJob());
}

/** DELETE — cancel running download */
export async function DELETE() {
  const job = getJob();
  if (job.status === "running") {
    job.status = "complete"; // Signal cancellation to the loop
  }
  return NextResponse.json({ cancelled: true });
}
