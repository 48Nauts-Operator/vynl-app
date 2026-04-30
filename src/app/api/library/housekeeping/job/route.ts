import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { parseFile } from "music-metadata";

const MAX_LOG_LINES = 500;

interface HousekeepingJob {
  id: string;
  action: string;
  status: "running" | "complete" | "error" | "cancelled";
  total: number;
  current: number;
  logs: string[];
  startedAt: number;
  completedAt?: number;
  result?: Record<string, unknown>;
}

// ── Persist state on globalThis so it survives Next.js dev-mode hot-reloads ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (_g.__vynl_housekeepingJob === undefined) _g.__vynl_housekeepingJob = null;

const g = {
  get job(): HousekeepingJob | null { return _g.__vynl_housekeepingJob; },
  set job(v: HousekeepingJob | null) { _g.__vynl_housekeepingJob = v; },
};

function log(line: string) {
  const job = g.job;
  if (!job) return;
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  job.logs.push(`[${ts}] ${line}`);
  if (job.logs.length > MAX_LOG_LINES) {
    job.logs = job.logs.slice(-MAX_LOG_LINES);
  }
}

// ── Background action runners ──

async function runCleanMissing() {
  const job = g.job;
  if (!job) return;

  const allTracks = db.select().from(tracks).all();
  job.total = allTracks.length;
  let removed = 0;

  log(`Checking ${allTracks.length} tracks for missing files...`);
  log("");

  for (let i = 0; i < allTracks.length; i++) {
    if (job.status === "cancelled") break;

    const track = allTracks[i];
    job.current = i + 1;

    try {
      fs.accessSync(track.filePath);
      // Only log every 50th OK track to avoid log spam
      if ((i + 1) % 50 === 0) {
        log(`  ... checked ${i + 1}/${allTracks.length}`);
      }
    } catch {
      db.delete(tracks).where(sql`${tracks.id} = ${track.id}`).run();
      removed++;
      log(`\u2717 Missing: ${track.artist} - ${track.title}`);
      log(`  ${track.filePath}`);
    }
  }

  job.result = { removed, total: allTracks.length };
  log("");
  log(`\u2501\u2501\u2501 COMPLETE \u2501\u2501\u2501`);
  log(`Removed ${removed} of ${allTracks.length} total tracks`);
}

async function runRefreshMetadata() {
  const job = g.job;
  if (!job) return;

  const allTracks = db.select().from(tracks).all();
  job.total = allTracks.length;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  log(`Refreshing metadata for ${allTracks.length} tracks...`);
  log("");

  for (let i = 0; i < allTracks.length; i++) {
    if (job.status === "cancelled") break;

    const track = allTracks[i];
    job.current = i + 1;

    try {
      fs.accessSync(track.filePath);
      const metadata = await parseFile(track.filePath);
      const { common, format } = metadata;

      const newData = {
        title: common.title || track.title,
        artist: common.artist || track.artist,
        album: common.album || track.album,
        albumArtist: common.albumartist || track.albumArtist,
        genre: common.genre?.[0] || track.genre,
        year: common.year || track.year,
        trackNumber: common.track?.no || track.trackNumber,
        discNumber: common.disk?.no || track.discNumber,
        duration: format.duration || track.duration,
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : track.bitrate,
        sampleRate: format.sampleRate || track.sampleRate,
      };

      // Check if anything actually changed
      const changed =
        newData.title !== track.title ||
        newData.artist !== track.artist ||
        newData.album !== track.album ||
        newData.albumArtist !== track.albumArtist ||
        newData.genre !== track.genre ||
        newData.year !== track.year ||
        newData.trackNumber !== track.trackNumber ||
        newData.discNumber !== track.discNumber ||
        Math.abs((newData.duration || 0) - (track.duration || 0)) > 0.5 ||
        newData.bitrate !== track.bitrate ||
        newData.sampleRate !== track.sampleRate;

      if (changed) {
        db.update(tracks).set(newData).where(sql`${tracks.id} = ${track.id}`).run();
        updated++;
        log(`\u2713 Updated: ${track.artist} - ${track.title}`);
      } else {
        unchanged++;
        // Log progress periodically
        if ((i + 1) % 50 === 0) {
          log(`  ... ${i + 1}/${allTracks.length} (${updated} updated)`);
        }
      }
    } catch (err) {
      errors++;
      log(`\u2717 Error: ${track.artist} - ${track.title}`);
      log(`  ${String(err).split("\n")[0]}`);
    }
  }

  job.result = { updated, unchanged, errors, total: allTracks.length };
  log("");
  log(`\u2501\u2501\u2501 COMPLETE \u2501\u2501\u2501`);
  log(`${updated} updated, ${unchanged} unchanged, ${errors} errors out of ${allTracks.length} tracks`);
}

async function runFetchArtwork() {
  const job = g.job;
  if (!job) return;

  const coversDir = path.join(process.cwd(), "public", "covers");
  if (!fs.existsSync(coversDir)) {
    fs.mkdirSync(coversDir, { recursive: true });
  }

  // Find albums without covers
  const sqlite = (db as any).session?.client || (db as any).$client;
  const albumsWithoutCovers = sqlite.prepare(`
    SELECT album, COALESCE(album_artist, artist) as album_artist,
           GROUP_CONCAT(id) as track_ids
    FROM tracks
    WHERE (cover_path IS NULL OR cover_path = '')
      AND source = 'local'
    GROUP BY album, COALESCE(album_artist, artist)
  `).all() as Array<{ album: string; album_artist: string; track_ids: string }>;

  job.total = albumsWithoutCovers.length;

  if (albumsWithoutCovers.length === 0) {
    log("All albums already have cover art!");
    job.result = { found: 0, notFound: 0, errors: 0, total: 0 };
    log("");
    log(`\u2501\u2501\u2501 COMPLETE \u2501\u2501\u2501`);
    log("Nothing to do");
    return;
  }

  log(`Found ${albumsWithoutCovers.length} albums without cover art`);
  log("");

  let found = 0;
  let notFound = 0;
  let errors = 0;
  let embedded = 0;

  for (let i = 0; i < albumsWithoutCovers.length; i++) {
    if (job.status === "cancelled") break;

    const album = albumsWithoutCovers[i];
    job.current = i + 1;

    log(`\u2192 [${i + 1}/${albumsWithoutCovers.length}] ${album.album_artist} - ${album.album}`);

    // Step 1: Try embedded art from one of the album's tracks
    const trackIds = album.track_ids.split(",").map(Number);
    let coverSaved = false;

    const sampleTrack = sqlite.prepare(`SELECT file_path FROM tracks WHERE id = ?`).get(trackIds[0]) as { file_path: string } | undefined;
    if (sampleTrack) {
      try {
        fs.accessSync(sampleTrack.file_path);
        const metadata = await parseFile(sampleTrack.file_path);
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          const pic = metadata.common.picture[0];
          const fmt = pic.format.replace("image/", "");
          const hash = crypto.createHash("md5").update(album.album + album.album_artist).digest("hex");
          const coverFilename = `${hash}.${fmt === "jpeg" ? "jpg" : fmt}`;
          fs.writeFileSync(path.join(coversDir, coverFilename), pic.data);
          const coverPath = `/covers/${coverFilename}`;

          // Update all tracks for this album
          for (const tid of trackIds) {
            sqlite.prepare(`UPDATE tracks SET cover_path = ? WHERE id = ?`).run(coverPath, tid);
          }
          log(`  \u2713 Extracted embedded art`);
          embedded++;
          coverSaved = true;
        }
      } catch {
        // No embedded art or file not accessible
      }
    }

    if (coverSaved) continue;

    // Step 2: Search iTunes API
    try {
      const query = `${album.album_artist} ${album.album}`;
      const url = `https://itunes.apple.com/search?${new URLSearchParams({
        term: query,
        entity: "album",
        limit: "3",
      })}`;

      const res = await fetch(url);
      if (!res.ok) {
        log(`  \u26a0 iTunes API returned ${res.status}`);
        errors++;
        continue;
      }

      const data = await res.json();
      const results = data.results || [];

      if (results.length > 0) {
        // Use the first result's artwork
        const artworkUrl = results[0].artworkUrl100?.replace("100x100", "600x600") || results[0].artworkUrl100;

        if (artworkUrl) {
          const imgRes = await fetch(artworkUrl);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const hash = crypto.createHash("md5").update(album.album + album.album_artist).digest("hex");
            const filename = `${hash}.jpg`;
            fs.writeFileSync(path.join(coversDir, filename), buffer);
            const coverPath = `/covers/${filename}`;

            for (const tid of trackIds) {
              sqlite.prepare(`UPDATE tracks SET cover_path = ? WHERE id = ?`).run(coverPath, tid);
            }
            log(`  \u2713 Downloaded from iTunes`);
            found++;
            continue;
          }
        }
      }

      log(`  \u26a0 No cover found`);
      notFound++;

      // Rate limit: small delay between iTunes API calls
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      log(`  \u2717 Error: ${String(err).split("\n")[0]}`);
      errors++;
    }
  }

  job.result = { found, embedded, notFound, errors, total: albumsWithoutCovers.length };
  log("");
  log(`\u2501\u2501\u2501 COMPLETE \u2501\u2501\u2501`);
  log(`${found} downloaded, ${embedded} extracted from files, ${notFound} not found, ${errors} errors`);
}

// ── Main background runner ──

async function runHousekeepingJob() {
  const job = g.job;
  if (!job) return;

  try {
    switch (job.action) {
      case "clean-missing":
        await runCleanMissing();
        break;
      case "refresh-metadata":
        await runRefreshMetadata();
        break;
      case "fetch-artwork":
        await runFetchArtwork();
        break;
    }

    if (job.status === "cancelled") {
      log("");
      log("\u2501\u2501\u2501 CANCELLED by user \u2501\u2501\u2501");
    } else {
      job.status = "complete";
    }
    job.completedAt = Date.now();
  } catch (err) {
    const j = g.job;
    if (j) {
      j.status = "error";
      j.completedAt = Date.now();
      log(`\u2717 Fatal error: ${err}`);
    }
  }
}

// ── HTTP handlers ──

const VALID_ACTIONS = ["clean-missing", "refresh-metadata", "fetch-artwork"];

export async function POST(request: NextRequest) {
  const job = g.job;

  if (job && job.status === "running") {
    return NextResponse.json(
      { error: "A housekeeping job is already running", action: job.action, jobId: job.id },
      { status: 409 }
    );
  }

  const body = await request.json();
  const { action } = body;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Use: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const jobId = `housekeeping-${Date.now()}`;

  g.job = {
    id: jobId,
    action,
    status: "running",
    total: 0,
    current: 0,
    logs: [],
    startedAt: Date.now(),
  };

  log(`Housekeeping started: ${action}`);
  log("");

  // Fire and forget
  runHousekeepingJob();

  return NextResponse.json({ jobId, action, message: `${action} started` });
}

export async function GET(request: NextRequest) {
  const job = g.job;

  if (!job) {
    return NextResponse.json({ status: "idle", message: "No housekeeping job" });
  }

  const url = new URL(request.url);
  const since = parseInt(url.searchParams.get("since") || "0", 10);
  const logs = job.logs.slice(since);

  return NextResponse.json({
    jobId: job.id,
    action: job.action,
    status: job.status,
    total: job.total,
    current: job.current,
    logs,
    logOffset: since,
    totalLogs: job.logs.length,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    result: job.result,
  });
}

export async function DELETE() {
  const job = g.job;

  if (!job || job.status !== "running") {
    return NextResponse.json({ error: "No running housekeeping job to cancel" }, { status: 400 });
  }

  job.status = "cancelled";
  log("\u26d4 Cancel requested by user");

  return NextResponse.json({ message: "Cancellation requested", action: job.action });
}
