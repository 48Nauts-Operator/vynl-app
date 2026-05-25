/**
 * Spotify Migration Wizard — real download via spotDL.
 *
 * Takes a list of spotify_tracks.id values from the wizard's review step
 * and runs spotDL per track in sequence. Outcomes:
 *
 *   - success → audio file lands in MUSIC_LIBRARY_PATH; the file watcher
 *     picks it up and imports to beets / Vynl tracks. The wish_list row
 *     (if any) is marked status="completed".
 *   - failure → wish_list row created/updated with status="not_found" so
 *     the user can find it later under /wishlist filtered by that status.
 *
 * Job state lives on globalThis like the existing /api/spotify/download
 * endpoint but in its own slot so the two don't collide.
 *
 * POST   { spotifyTrackIds: number[] }  → kicks off the job (background)
 * GET                                    → poll status / per-track outcomes
 * DELETE                                 → cancel (mid-loop break)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotifyTracks, spotifyPlaylists, spotifyPlaylistTracks, wishList } from "@/lib/db/schema";
import { inArray, eq } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface MigrationDownloadJob {
  status: "idle" | "running" | "complete" | "cancelled";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  alreadyHad: number;          // tracks already in local library (skipped)
  currentTrack?: string;
  results: Array<{
    spotifyTrackId: number;
    title: string;
    artist: string;
    outcome: "success" | "not_found" | "already_local";
    error?: string;
  }>;
  startedAt: string;
  completedAt?: string;
}

const _g = globalThis as typeof globalThis & {
  __vynl_migrationDownloadJob?: MigrationDownloadJob | null;
};

function getJob(): MigrationDownloadJob {
  return (
    _g.__vynl_migrationDownloadJob || {
      status: "idle",
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      alreadyHad: 0,
      results: [],
      startedAt: "",
    }
  );
}

function setJob(job: MigrationDownloadJob) {
  _g.__vynl_migrationDownloadJob = job;
}

export async function GET() {
  return NextResponse.json(getJob());
}

export async function DELETE() {
  const job = getJob();
  if (job.status === "running") {
    job.status = "cancelled";
  }
  return NextResponse.json({ cancelled: true });
}

export async function POST(request: NextRequest) {
  const existing = getJob();
  if (existing.status === "running") {
    return NextResponse.json({ error: "Migration download already running" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body?.spotifyTrackIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "spotifyTrackIds[] required" }, { status: 400 });
  }

  const numericIds = ids
    .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
    .filter((n) => Number.isFinite(n));
  if (numericIds.length === 0) {
    return NextResponse.json({ error: "no valid track IDs" }, { status: 400 });
  }

  // Pull the rows; skip anything already-local upfront.
  const rows = db.select().from(spotifyTracks).where(inArray(spotifyTracks.id, numericIds)).all();
  const alreadyLocalRows = rows.filter((r) => r.localTrackId != null);
  const toDownload = rows.filter((r) => r.localTrackId == null);

  const job: MigrationDownloadJob = {
    status: "running",
    total: rows.length,
    processed: alreadyLocalRows.length,
    succeeded: 0,
    failed: 0,
    alreadyHad: alreadyLocalRows.length,
    results: alreadyLocalRows.map((r) => ({
      spotifyTrackId: r.id,
      title: r.title,
      artist: r.artist,
      outcome: "already_local" as const,
    })),
    startedAt: new Date().toISOString(),
  };
  setJob(job);

  const outputDir = process.env.MUSIC_LIBRARY_PATH || process.cwd();
  console.log(
    `[migration-download] starting · total=${rows.length} ` +
      `alreadyLocal=${alreadyLocalRows.length} toDownload=${toDownload.length} ` +
      `outputDir=${outputDir}`
  );

  // Run downloads in background — don't await.
  (async () => {
    for (const track of toDownload) {
      if (job.status === "cancelled") break;
      if (!track.spotifyUri) {
        job.results.push({
          spotifyTrackId: track.id,
          title: track.title,
          artist: track.artist,
          outcome: "not_found",
          error: "no spotifyUri",
        });
        job.failed++;
        job.processed++;
        continue;
      }

      job.currentTrack = `${track.artist} — ${track.title}`;
      const t0 = Date.now();
      console.log(`[migration-download] ${job.processed + 1}/${rows.length} ${job.currentTrack}`);

      try {
        await execFileAsync(
          "spotdl",
          ["download", track.spotifyUri, "--output", outputDir],
          { timeout: 180_000 } // 3 min cap per track — enough for slow YouTube fetches
        );
        // Success — file dropped, file watcher will import it.
        // Mark + record an event for the user.
        job.succeeded++;
        job.results.push({
          spotifyTrackId: track.id,
          title: track.title,
          artist: track.artist,
          outcome: "success",
        });
        // If a wish_list row exists for this Spotify track, mark it completed.
        db.update(wishList)
          .set({ status: "completed" })
          .where(eq(wishList.spotifyTrackId, track.id))
          .run();
        console.log(`[migration-download] OK ${job.currentTrack} ${Date.now() - t0}ms`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[migration-download] FAIL ${job.currentTrack} ${Date.now() - t0}ms err=${msg}`);
        job.failed++;
        job.results.push({
          spotifyTrackId: track.id,
          title: track.title,
          artist: track.artist,
          outcome: "not_found",
          error: msg.slice(0, 200),
        });

        // Push to wish_list with status="not_found" so the user can find it
        // later. Idempotent — update if a row already exists, otherwise insert.
        const existingWl = db
          .select({ id: wishList.id })
          .from(wishList)
          .where(eq(wishList.spotifyTrackId, track.id))
          .get();
        if (existingWl) {
          db.update(wishList)
            .set({ status: "not_found" })
            .where(eq(wishList.id, existingWl.id))
            .run();
        } else {
          // Resolve playlist names so the row carries the same provenance
          // as Add-to-Wishlist would.
          const plRows = db
            .select({ name: spotifyPlaylists.name })
            .from(spotifyPlaylistTracks)
            .innerJoin(spotifyPlaylists, eq(spotifyPlaylists.id, spotifyPlaylistTracks.spotifyPlaylistId))
            .where(eq(spotifyPlaylistTracks.spotifyTrackId, track.id))
            .all();
          db.insert(wishList)
            .values({
              type: "spotify_missing",
              seedTitle: track.title,
              seedArtist: track.artist,
              seedAlbum: track.album,
              spotifyTrackId: track.id,
              spotifyUri: track.spotifyUri,
              isrc: track.isrc,
              coverUrl: track.coverUrl,
              spotifyPlaylistNames: JSON.stringify(plRows.map((p) => p.name)),
              popularity: track.popularity,
              status: "not_found",
            })
            .run();
        }
      }

      job.processed++;
    }

    job.status = job.status === "cancelled" ? "cancelled" : "complete";
    job.completedAt = new Date().toISOString();
    job.currentTrack = undefined;
    console.log(
      `[migration-download] done · succeeded=${job.succeeded} failed=${job.failed} ` +
        `alreadyHad=${job.alreadyHad} status=${job.status}`
    );
  })();

  return NextResponse.json({ started: true, total: rows.length });
}
