import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { spawn } from "child_process";
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
  /** Absolute path to the per-job log file under ./logs/. Tee target for
   *  log() so users can review full output beyond the 500-line UI buffer. */
  logFilePath?: string;
  /** Per-job options passed in via POST body. Currently only consumed by
   *  the beets-doctor action: planOnly = true skips all beet writes. */
  options?: { planOnly?: boolean };
}

// ── External log directory ──
// Persisted at ./logs/ relative to cwd (i.e. /app/logs in container, repo
// root in dev). Each job gets its own file; `current.log` symlinks to the
// most recently started job so `tail -f logs/current.log` always works.
const LOG_DIR = path.join(process.cwd(), "logs");

function ensureLogDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }
}

function openJobLogFile(jobId: string, action: string): string | undefined {
  try {
    ensureLogDir();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(LOG_DIR, `${ts}_${action}_${jobId}.log`);
    fs.writeFileSync(filePath, `# Vynl housekeeping log\n# Job: ${jobId}\n# Action: ${action}\n# Started: ${new Date().toISOString()}\n\n`);
    // Refresh current.log symlink so it always points at the latest job.
    const current = path.join(LOG_DIR, "current.log");
    try { fs.unlinkSync(current); } catch { /* may not exist */ }
    try { fs.symlinkSync(path.basename(filePath), current); } catch { /* symlinks may be unsupported (Windows, some bind mounts) — ignore */ }
    return filePath;
  } catch {
    return undefined;
  }
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
  const formatted = `[${ts}] ${line}`;
  job.logs.push(formatted);
  if (job.logs.length > MAX_LOG_LINES) {
    job.logs = job.logs.slice(-MAX_LOG_LINES);
  }
  // Tee to disk. Append-only; failures must never break the runner.
  if (job.logFilePath) {
    try { fs.appendFileSync(job.logFilePath, formatted + "\n"); } catch { /* disk full / readonly — ignore */ }
  }
}

// ── Background action runners ──

async function runCleanMissing() {
  const job = g.job;
  if (!job) return;

  const allTracks = db.select().from(tracks).all();
  job.total = allTracks.length;
  let removed = 0;

  log(`Checking ${allTracks.length} Vynl tracks for missing files...`);
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

  log("");
  log(`Vynl DB: removed ${removed} of ${allTracks.length} tracks`);

  // Also clean orphans from the beets DB so the next `beet lastgenre` /
  // `beet update` run isn't flooded with read errors. Vynl's DB and
  // beets' DB are separate, and Vynl previously only touched its own.
  let beetsRemoved = 0;
  let beetsTotal = 0;
  try {
    log("");
    log("Cleaning orphans from beets DB...");
    const beetsCleanup = await runBeetsCleanMissing();
    beetsRemoved = beetsCleanup.removed;
    beetsTotal = beetsCleanup.total;
    log(`Beets DB: removed ${beetsRemoved} of ${beetsTotal} items`);
  } catch (err) {
    log(`\u26a0 Beets cleanup skipped: ${err}`);
  }

  job.result = {
    removed,
    total: allTracks.length,
    beetsRemoved,
    beetsTotal,
  };
  log("");
  log(`\u2501\u2501\u2501 COMPLETE \u2501\u2501\u2501`);
  log(
    `Removed ${removed} Vynl tracks + ${beetsRemoved} beets items.`
  );
}

/**
 * Bulk-remove orphan items from the beets library DB. Runs a tiny Python
 * helper inside the same process container so beets' library API can
 * batch the deletes (~100x faster than spawning `beet rm` per item).
 */
async function runBeetsCleanMissing(): Promise<{ removed: number; total: number }> {
  return new Promise((resolve, reject) => {
    const script = `
import os
from beets.library import Library
lib = Library("/music/library.db")
items = list(lib.items())
total = len(items)
removed = 0
for it in items:
    p = it.path.decode("utf-8", "replace") if isinstance(it.path, bytes) else it.path
    if not os.path.exists(p):
        it.remove(delete=False)
        removed += 1
print(f"{removed} {total}")
`;
    const proc = spawn("/opt/vynl-venv/bin/python3", ["-c", script]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `python exited with code ${code}`));
        return;
      }
      const [removedStr, totalStr] = stdout.trim().split(/\s+/);
      resolve({
        removed: parseInt(removedStr) || 0,
        total: parseInt(totalStr) || 0,
      });
    });
  });
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

      // Compilation detection: iTunes TCMP tag wins; fall back to an
      // albumartist heuristic for files that never had TCMP written. Same
      // logic as filesystem-adapter so initial scan and refresh agree.
      const newAlbumArtist = common.albumartist || track.albumArtist;
      const newIsCompilation =
        common.compilation === true ||
        (newAlbumArtist || "").toLowerCase().includes("various");

      const newData = {
        title: common.title || track.title,
        artist: common.artist || track.artist,
        album: common.album || track.album,
        albumArtist: newAlbumArtist,
        genre: common.genre?.[0] || track.genre,
        year: common.year || track.year,
        trackNumber: common.track?.no || track.trackNumber,
        discNumber: common.disk?.no || track.discNumber,
        duration: format.duration || track.duration,
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : track.bitrate,
        sampleRate: format.sampleRate || track.sampleRate,
        isCompilation: newIsCompilation,
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
        newData.sampleRate !== track.sampleRate ||
        newData.isCompilation !== track.isCompilation;

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

    // Step 2: Multi-provider cover search (CAA + Deezer + iTunes).
    // iTunes throttles aggressively so we no longer depend on it
    // exclusively. searchCoverArt() de-duplicates across providers
    // and returns the best hit list ordered by source quality.
    try {
      const { searchCoverArt } = await import("@/lib/cover-art");
      const query = `${album.album_artist} ${album.album}`;
      const results = await searchCoverArt(query);

      if (results.length > 0) {
        const top = results[0];
        const imgRes = await fetch(top.artworkUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const hash = crypto.createHash("md5").update(album.album + album.album_artist).digest("hex");
          // CAA serves PNG sometimes, Deezer/iTunes JPG. .jpg ext is
          // fine for /covers/ static serving \u2014 browser sniffs the
          // bytes anyway.
          const filename = `${hash}.jpg`;
          fs.writeFileSync(path.join(coversDir, filename), buffer);
          const coverPath = `/covers/${filename}`;

          for (const tid of trackIds) {
            sqlite.prepare(`UPDATE tracks SET cover_path = ? WHERE id = ?`).run(coverPath, tid);
          }
          log(`  \u2713 Downloaded from ${top.source}`);
          found++;
          continue;
        }
      }

      log(`  \u26a0 No cover found across CAA / Deezer / iTunes`);
      notFound++;

      // Small delay between rounds \u2014 MusicBrainz wants 1 req/sec.
      await new Promise((r) => setTimeout(r, 1100));
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

// ── Refresh Genres (beet lastgenre) ──

async function runRefreshGenres() {
  const job = g.job;
  if (!job) return;

  log("Running `beet lastgenre -f` — re-fetches canonical genres from Last.fm for every album.");
  log("This can take 10–30 min on a large library (Last.fm rate-limits ~1 req/sec).");
  log("");

  return new Promise<void>((resolve) => {
    const proc = spawn("beet", ["lastgenre", "-f"], { env: process.env });
    let updated = 0;
    let errors = 0;

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      log(line);
      if (line.startsWith("lastgenre:")) {
        updated++;
        job.current = updated;
      }
      if (/error|fail/i.test(line)) errors++;
    };

    let stdoutBuf = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() || "";
      for (const ln of lines) consumeLine(ln);
    });

    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() || "";
      for (const ln of lines) consumeLine(ln);
    });

    proc.on("error", (err) => {
      log(`✗ Failed to launch beet: ${err.message}`);
      log("Is the beets CLI installed in this container? Flight Check in /settings will tell you.");
      job.result = { updated: 0, errors: 1, total: 0 };
      resolve();
    });

    proc.on("close", (code) => {
      if (stdoutBuf) consumeLine(stdoutBuf);
      if (stderrBuf) consumeLine(stderrBuf);
      log("");
      log(`━━━ ${code === 0 ? "COMPLETE" : `EXITED with code ${code}`} ━━━`);
      log(`${updated} albums updated, ${errors} errors`);
      log("");
      log("Tip: run a library scan now so Vynl picks up the new genres in its DB.");
      job.result = { updated, errors, total: updated };
      resolve();
    });

    // Honour user cancellation
    const cancelWatcher = setInterval(() => {
      if (job.status === "cancelled") {
        proc.kill("SIGTERM");
        clearInterval(cancelWatcher);
      }
    }, 1000);
    proc.on("close", () => clearInterval(cancelWatcher));
  });
}

// ── BeetsAI Doctor ──

async function runBeetsDoctor() {
  const job = g.job;
  if (!job) return;

  const {
    findCompilationCandidates,
    findDiscSplits,
    judgeCompilation,
    judgeDiscSplit,
    judgeJunk,
  } = await import("@/lib/beets-doctor/detect");
  const { buildCompilationPrompt, buildDiscSplitPrompt } = await import(
    "@/lib/beets-doctor/prompts"
  );
  const { applyModify, applyWrite } = await import("@/lib/beets-doctor/apply");
  const { generateText, getActiveSettings } = await import("@/lib/llm");
  const { beetsaiActions, beetsaiReview } = await import("@/lib/db/schema");
  const dbModule = await import("@/lib/db");
  const localDb = dbModule.db;

  const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const llm = getActiveSettings();
  const planOnly = job.options?.planOnly === true;
  log(`Scan ${scanId} starting — LLM: ${llm.provider}/${llm.model}`);
  if (planOnly) {
    log("▣ PLAN MODE — no beet writes; findings logged only.");
  }
  log("");

  let autoApplied = 0;
  let queued = 0;
  let errors = 0;
  let scanned = 0;

  interface LLMVerdict {
    shouldFix: boolean;
    confidence: number;
    command: "modify" | "skip";
    args: string[];
    reasoning: string;
  }

  async function consultLLM(prompt: string): Promise<LLMVerdict | null> {
    // Some open-weight models drift after a string of similar prompts and
    // start returning non-JSON tokens (we saw qwen3.5 mix Chinese chars
    // into the middle of a JSON value, gemma do the same). One retry
    // with a curt "JSON ONLY" reminder almost always recovers.
    //
    // Reasoning models (qwen3, deepseek-r1, gpt-oss) emit a
    // `<think>...</think>` block BEFORE the answer. Strip it before the
    // regex; otherwise the regex grabs JSON-like fragments from inside
    // the reasoning trace, or — worse — the answer JSON never gets
    // emitted because max_tokens ran out mid-thought. We allow 2000
    // tokens to give reasoning models headroom.
    let lastRaw = "";
    const stripReasoning = (s: string) =>
      s.replace(/<think>[\s\S]*?<\/think>/gi, "")
       .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
       .trim();

    const attempt = async (variant: 0 | 1): Promise<LLMVerdict | null> => {
      const messages =
        variant === 0
          ? [{ role: "user" as const, content: prompt }]
          : [
              {
                role: "system" as const,
                content:
                  "You must respond with a single valid JSON object only. No prose, no markdown, no commentary. Start with { and end with }.",
              },
              { role: "user" as const, content: prompt },
            ];
      try {
        const text = await generateText({
          maxTokens: 2000,
          jsonMode: true,
          messages,
        });
        lastRaw = text;
        const cleaned = stripReasoning(text);
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const parsed = JSON.parse(match[0]) as LLMVerdict;
        parsed.confidence = Math.max(
          0,
          Math.min(1, Number(parsed.confidence) || 0)
        );
        return parsed;
      } catch {
        return null;
      }
    };

    const first = await attempt(0);
    if (first) return first;
    const retry = await attempt(1);
    if (retry) {
      log(`  ↻ recovered on retry`);
      return retry;
    }
    // Both attempts failed — surface a snippet of what the LLM actually
    // said so the user can see whether it's empty, reasoning-only,
    // markdown-wrapped, etc. without re-running with debug flags.
    const snippet = (lastRaw || "(empty response)")
      .slice(0, 400)
      .replace(/\n/g, " \\n ");
    log(`    raw[0..400]: ${snippet}`);
    return null;
  }

  // ── Pass 1: Unflagged compilation candidates ──
  log("━━━ Pass 1/2: Unflagged compilations ━━━");
  const comps = findCompilationCandidates();
  log(`Found ${comps.length} candidate(s) to evaluate.`);
  log("");
  job.total = comps.length; // initial estimate; updated when pass 2 starts

  for (let i = 0; i < comps.length; i++) {
    if (job.status === "cancelled") return;
    const c = comps[i];
    job.current = i + 1;
    scanned++;
    log(`→ [${i + 1}/${comps.length}] "${c.album}" (${c.distinctArtists} artists, ${c.trackCount} tracks)`);

    // RULE-FIRST: bypass the LLM when the metadata makes the call
    // deterministic (>= 8 distinct artists → unambiguous compilation).
    // The LLM only sees genuinely borderline candidates from here on.
    const rule = judgeCompilation(c);
    let verdict: LLMVerdict | null = null;
    let usedRule = false;
    if (rule.auto && rule.command) {
      verdict = {
        shouldFix: true,
        confidence: 1.0,
        command: "modify",
        args: rule.command,
        reasoning: rule.reasoning,
      };
      usedRule = true;
      log(`  ▸ rule: ${rule.reasoning}`);
    } else {
      verdict = await consultLLM(buildCompilationPrompt(c));
      if (!verdict) {
        log(`  ⚠ LLM returned no valid JSON — skipping`);
        errors++;
        continue;
      }
      if (!verdict.shouldFix) {
        log(`  ✓ LLM says not a compilation (${(verdict.confidence * 100).toFixed(0)}% conf) — skipping`);
        continue;
      }
    }
    const modelLabel = usedRule ? "rule-based" : llm.model;

    if (verdict.confidence >= 1.0) {
      if (planOnly) {
        // Plan mode: queue it as "auto-confidence" review so we can see
        // what would have run, without touching beets.
        localDb.insert(beetsaiReview).values({
          scanId,
          issueType: "compilation",
          albumName: c.album,
          albumArtist: c.currentAlbumArtist,
          context: JSON.stringify({
            trackCount: c.trackCount,
            distinctArtists: c.distinctArtists,
            sampleArtists: c.sampleArtists,
            sampleTitles: c.sampleTitles,
            year: c.year,
            planMode: true,
            wouldAutoApply: true,
          }),
          proposedCommand: `beet ${verdict.args.join(" ")}`,
          proposedArgs: JSON.stringify(verdict.args),
          confidence: verdict.confidence,
          llmModel: modelLabel,
          reasoning: verdict.reasoning,
          status: "pending",
        }).run();
        log(`  ▣ PLAN: would auto-apply (100% conf, ${modelLabel}) — ${verdict.reasoning}`);
        queued++;
        continue;
      }
      log(`  → applying: beet ${verdict.args.join(" ")}`);
      const result = await applyModify(verdict.args, c.album);
      if (result.success) {
        localDb.insert(beetsaiActions).values({
          issueType: "compilation",
          albumName: c.album,
          albumArtist: c.currentAlbumArtist,
          beetsCommand: `beet ${verdict.args.join(" ")}`,
          beetsArgs: JSON.stringify(verdict.args),
          before: JSON.stringify(result.before || {}),
          after: JSON.stringify(result.after || {}),
          source: usedRule ? "rule" : "auto",
          confidence: verdict.confidence,
          llmModel: modelLabel,
          reasoning: verdict.reasoning,
          status: "applied",
        }).run();
        const sync =
          result.vynlRowsUpdated === null || result.vynlRowsUpdated === undefined
            ? "(Vynl sync skipped)"
            : result.vynlRowsUpdated === 0
              ? "⚠ Vynl sync matched 0 rows — Refresh Metadata needed"
              : `Vynl sync: ${result.vynlRowsUpdated} rows`;
        log(`  ✓ applied — ${verdict.reasoning} [${sync}]`);
        autoApplied++;
      } else {
        log(`  ✗ apply failed: ${result.error}`);
        errors++;
      }
    } else {
      localDb.insert(beetsaiReview).values({
        scanId,
        issueType: "compilation",
        albumName: c.album,
        albumArtist: c.currentAlbumArtist,
        context: JSON.stringify({
          trackCount: c.trackCount,
          distinctArtists: c.distinctArtists,
          sampleArtists: c.sampleArtists,
          sampleTitles: c.sampleTitles,
          year: c.year,
        }),
        proposedCommand: `beet ${verdict.args.join(" ")}`,
        proposedArgs: JSON.stringify(verdict.args),
        confidence: verdict.confidence,
        llmModel: modelLabel,
        reasoning: verdict.reasoning,
        status: "pending",
      }).run();
      log(`  ⊕ queued for review (${(verdict.confidence * 100).toFixed(0)}% conf) — ${verdict.reasoning}`);
      queued++;
    }
  }

  // ── Pass 2: Disc / volume splits ──
  log("");
  log("━━━ Pass 2/2: Disc / volume splits ━━━");
  const splits = findDiscSplits();
  log(`Found ${splits.length} candidate group(s).`);
  log("");
  job.total = comps.length + splits.length;

  for (let i = 0; i < splits.length; i++) {
    if (job.status === "cancelled") return;
    const s = splits[i];
    job.current = comps.length + i + 1;
    scanned++;
    log(
      `→ [${i + 1}/${splits.length}] "${s.baseName}" (${s.parts.length} variants: ${s.parts.map((p) => `"${p.album}"`).join(" + ")})`
    );

    // RULE-FIRST: if every variant shares the same albumartist, the
    // merge is deterministic (same release, just split across discs).
    // Different artists need LLM judgement (could be unrelated albums
    // that happen to share a base name).
    const splitRule = judgeDiscSplit(s);
    let verdict: LLMVerdict | null = null;
    let usedRule = false;
    if (splitRule.auto) {
      verdict = {
        shouldFix: true,
        confidence: 1.0,
        command: "modify",
        args: [], // unused — the loop below builds per-variant args
        reasoning: splitRule.reasoning,
      };
      usedRule = true;
      log(`  ▸ rule: ${splitRule.reasoning}`);
    } else {
      verdict = await consultLLM(buildDiscSplitPrompt(s));
      if (!verdict) {
        log(`  ⚠ LLM returned no valid JSON — skipping`);
        errors++;
        continue;
      }
      if (!verdict.shouldFix) {
        log(`  ✓ LLM says these are distinct albums (${(verdict.confidence * 100).toFixed(0)}% conf) — skipping`);
        continue;
      }
    }
    const modelLabel = usedRule ? "rule-based" : llm.model;

    // For each variant whose name ≠ base, rename it to base.
    if (verdict.confidence >= 1.0) {
      if (planOnly) {
        localDb.insert(beetsaiReview).values({
          scanId,
          issueType: "disc-split",
          albumName: s.baseName,
          albumArtist: s.parts[0].albumArtist,
          context: JSON.stringify({
            variants: s.parts,
            planMode: true,
            wouldAutoApply: true,
          }),
          proposedCommand: `beet modify -y album:<each-variant> album=${s.baseName}`,
          proposedArgs: JSON.stringify(s.parts.map((p) => p.album)),
          confidence: verdict.confidence,
          llmModel: modelLabel,
          reasoning: verdict.reasoning,
          status: "pending",
        }).run();
        log(`  ▣ PLAN: would auto-merge ${s.parts.length} variants into "${s.baseName}" — ${verdict.reasoning}`);
        queued++;
        continue;
      }
      let anyFailed = false;
      for (const part of s.parts) {
        if (part.album === s.baseName) continue;
        const renameArgs = [
          "modify",
          "-y",
          `album:${part.album}`,
          `album=${s.baseName}`,
        ];
        log(`  → applying: beet ${renameArgs.join(" ")}`);
        const result = await applyModify(renameArgs, part.album);
        if (result.success) {
          localDb.insert(beetsaiActions).values({
            issueType: "disc-split",
            albumName: part.album,
            albumArtist: part.albumArtist,
            beetsCommand: `beet ${renameArgs.join(" ")}`,
            beetsArgs: JSON.stringify(renameArgs),
            before: JSON.stringify(result.before || {}),
            after: JSON.stringify(result.after || {}),
            source: usedRule ? "rule" : "auto",
            confidence: verdict.confidence,
            llmModel: modelLabel,
            reasoning: verdict.reasoning,
            status: "applied",
          }).run();
          autoApplied++;
        } else {
          log(`  ✗ apply failed: ${result.error}`);
          errors++;
          anyFailed = true;
        }
      }
      // Push DB changes to file tags so future scans see them.
      if (!anyFailed) {
        await applyWrite(`album:${s.baseName}`);
      }
      log(`  ✓ merged variants into "${s.baseName}"`);
    } else {
      localDb.insert(beetsaiReview).values({
        scanId,
        issueType: "disc-split",
        albumName: s.baseName,
        albumArtist: s.parts[0].albumArtist,
        context: JSON.stringify({
          variants: s.parts,
        }),
        proposedCommand: `beet modify -y album:<each-variant> album=${s.baseName}`,
        proposedArgs: JSON.stringify(s.parts.map((p) => p.album)),
        confidence: verdict.confidence,
        llmModel: modelLabel,
        reasoning: verdict.reasoning,
        status: "pending",
      }).run();
      log(`  ⊕ queued for review (${(verdict.confidence * 100).toFixed(0)}% conf) — ${verdict.reasoning}`);
      queued++;
    }
  }

  // ── Pass 3: Junk / orphan entries ──
  log("");
  log("━━━ Pass 3/4: Junk / orphan entries ━━━");
  const { findJunkEntries, findGenreIssues } = await import(
    "@/lib/beets-doctor/detect"
  );
  const { buildJunkPrompt, buildGenrePrompt } = await import(
    "@/lib/beets-doctor/prompts"
  );
  const { applyRemove } = await import("@/lib/beets-doctor/apply");

  const junks = findJunkEntries();
  log(`Found ${junks.length} suspicious entries.`);
  log("");
  job.total = comps.length + splits.length + junks.length;

  for (let i = 0; i < junks.length; i++) {
    if (job.status === "cancelled") return;
    const j = junks[i];
    job.current = comps.length + splits.length + i + 1;
    scanned++;
    const albumLabel = j.album === null ? "(null)" : j.album === "" ? "(empty)" : j.album;
    log(`→ [${i + 1}/${junks.length}] reason=${j.reason}, album=${albumLabel}, title="${j.title}"`);

    // RULE-FIRST: url-as-album and blank-album are unambiguous removes
    // from beets DB (files on disk never touched — applyRemove strips
    // -d/--delete). Single-track stubs need LLM judgement.
    const junkRule = judgeJunk(j);
    let verdict: LLMVerdict | null = null;
    let usedRule = false;
    if (junkRule.auto && junkRule.command) {
      verdict = {
        shouldFix: true,
        confidence: 1.0,
        command: "modify",
        args: junkRule.command,
        reasoning: junkRule.reasoning,
      };
      usedRule = true;
      log(`  ▸ rule: ${junkRule.reasoning}`);
    } else {
      verdict = await consultLLM(buildJunkPrompt(j));
      if (!verdict) {
        log(`  ⚠ LLM returned no valid JSON — skipping`);
        errors++;
        continue;
      }
      // verdict.command can be "modify" | "remove" | "skip"
      const cmd = (verdict as unknown as { command: string }).command;
      if (cmd === "skip" || !verdict.shouldFix) {
        log(`  ✓ LLM says leave alone (${(verdict.confidence * 100).toFixed(0)}% conf)`);
        continue;
      }
    }
    const modelLabel = usedRule ? "rule-based" : llm.model;
    const cmd = (verdict as unknown as { command: string }).command;
    const proposedAction = cmd === "remove" || verdict.args[0] === "remove" ? "remove" : "modify";
    const targetForSnapshot = j.album || `id:${j.itemId}`;

    if (verdict.confidence >= 1.0) {
      if (planOnly) {
        localDb.insert(beetsaiReview).values({
          scanId,
          issueType: "junk",
          albumName: albumLabel,
          albumArtist: j.artist,
          context: JSON.stringify({
            itemId: j.itemId,
            title: j.title,
            artist: j.artist,
            path: j.path,
            reason: j.reason,
            planMode: true,
            wouldAutoApply: true,
            action: proposedAction,
          }),
          proposedCommand: `beet ${verdict.args.join(" ")}`,
          proposedArgs: JSON.stringify(verdict.args),
          confidence: verdict.confidence,
          llmModel: modelLabel,
          reasoning: verdict.reasoning,
          status: "pending",
        }).run();
        log(`  ▣ PLAN: would ${proposedAction} — ${verdict.reasoning}`);
        queued++;
        continue;
      }
      log(`  → applying: beet ${verdict.args.join(" ")}`);
      const result =
        proposedAction === "remove"
          ? await applyRemove(verdict.args)
          : await applyModify(verdict.args, j.album || "");
      if (result.success) {
        localDb.insert(beetsaiActions).values({
          issueType: "junk",
          albumName: albumLabel,
          albumArtist: j.artist,
          beetsCommand: `beet ${verdict.args.join(" ")}`,
          beetsArgs: JSON.stringify(verdict.args),
          before: JSON.stringify(result.before || { itemId: j.itemId, album: j.album, title: j.title }),
          after: JSON.stringify(result.after || { removed: proposedAction === "remove" }),
          source: usedRule ? "rule" : "auto",
          confidence: verdict.confidence,
          llmModel: modelLabel,
          reasoning: verdict.reasoning,
          status: "applied",
        }).run();
        log(`  ✓ ${proposedAction} — ${verdict.reasoning}`);
        autoApplied++;
      } else {
        log(`  ✗ apply failed: ${result.error}`);
        errors++;
      }
    } else {
      localDb.insert(beetsaiReview).values({
        scanId,
        issueType: "junk",
        albumName: albumLabel,
        albumArtist: j.artist,
        context: JSON.stringify({
          itemId: j.itemId,
          title: j.title,
          artist: j.artist,
          path: j.path,
          reason: j.reason,
          action: proposedAction,
        }),
        proposedCommand: `beet ${verdict.args.join(" ")}`,
        proposedArgs: JSON.stringify(verdict.args),
        confidence: verdict.confidence,
        llmModel: modelLabel,
        reasoning: verdict.reasoning,
        status: "pending",
      }).run();
      log(`  ⊕ queued (${(verdict.confidence * 100).toFixed(0)}% conf) — ${verdict.reasoning}`);
      queued++;
    }
  }

  // ── Pass 4: Empty / wrong genres ──
  log("");
  log("━━━ Pass 4/4: Empty / wrong genres ━━━");
  const genres = findGenreIssues({ includeEmpty: true, limit: 300 });
  log(`Found ${genres.length} candidate album(s) with missing or suspect genres.`);
  log("");
  job.total = comps.length + splits.length + junks.length + genres.length;

  for (let i = 0; i < genres.length; i++) {
    if (job.status === "cancelled") return;
    const g = genres[i];
    job.current = comps.length + splits.length + junks.length + i + 1;
    scanned++;
    const currentTag =
      g.currentGenres.length === 0 ? "(empty)" : g.currentGenres.join(", ");
    log(`→ [${i + 1}/${genres.length}] "${g.album}" by ${g.albumArtist} — current: ${currentTag}`);

    const verdict = await consultLLM(buildGenrePrompt(g));
    if (!verdict) {
      log(`  ⚠ LLM returned no valid JSON — skipping`);
      errors++;
      continue;
    }
    if (!verdict.shouldFix || (verdict as unknown as { command: string }).command === "skip") {
      log(`  ✓ LLM says genre is fine (${(verdict.confidence * 100).toFixed(0)}% conf)`);
      continue;
    }

    if (verdict.confidence >= 1.0) {
      if (planOnly) {
        localDb.insert(beetsaiReview).values({
          scanId,
          issueType: "wrong-genre",
          albumName: g.album,
          albumArtist: g.albumArtist,
          context: JSON.stringify({
            trackCount: g.trackCount,
            currentGenres: g.currentGenres,
            sampleArtists: g.sampleArtists,
            sampleTitles: g.sampleTitles,
            year: g.year,
            planMode: true,
            wouldAutoApply: true,
          }),
          proposedCommand: `beet ${verdict.args.join(" ")}`,
          proposedArgs: JSON.stringify(verdict.args),
          confidence: verdict.confidence,
          llmModel: llm.model,
          reasoning: verdict.reasoning,
          status: "pending",
        }).run();
        log(`  ▣ PLAN: would set genre — ${verdict.reasoning}`);
        queued++;
        continue;
      }
      log(`  → applying: beet ${verdict.args.join(" ")}`);
      const result = await applyModify(verdict.args, g.album);
      if (result.success) {
        localDb.insert(beetsaiActions).values({
          issueType: "wrong-genre",
          albumName: g.album,
          albumArtist: g.albumArtist,
          beetsCommand: `beet ${verdict.args.join(" ")}`,
          beetsArgs: JSON.stringify(verdict.args),
          before: JSON.stringify(result.before || { genres: g.currentGenres }),
          after: JSON.stringify(result.after || {}),
          source: "auto",
          confidence: verdict.confidence,
          llmModel: llm.model,
          reasoning: verdict.reasoning,
          status: "applied",
        }).run();
        log(`  ✓ genre updated — ${verdict.reasoning}`);
        autoApplied++;
      } else {
        log(`  ✗ apply failed: ${result.error}`);
        errors++;
      }
    } else {
      localDb.insert(beetsaiReview).values({
        scanId,
        issueType: "wrong-genre",
        albumName: g.album,
        albumArtist: g.albumArtist,
        context: JSON.stringify({
          trackCount: g.trackCount,
          currentGenres: g.currentGenres,
          sampleArtists: g.sampleArtists,
          sampleTitles: g.sampleTitles,
          year: g.year,
        }),
        proposedCommand: `beet ${verdict.args.join(" ")}`,
        proposedArgs: JSON.stringify(verdict.args),
        confidence: verdict.confidence,
        llmModel: llm.model,
        reasoning: verdict.reasoning,
        status: "pending",
      }).run();
      log(`  ⊕ queued (${(verdict.confidence * 100).toFixed(0)}% conf) — ${verdict.reasoning}`);
      queued++;
    }
  }

  log("");
  log("━━━ COMPLETE ━━━");
  log(`Scanned ${scanned} candidates`);
  log(`Auto-applied: ${autoApplied}`);
  log(`Queued for review: ${queued}`);
  log(`Errors: ${errors}`);
  log("");
  log(`Review queue at Library → Doctor → Review (scan id: ${scanId})`);
  log("Run a library scan afterwards so Vynl picks up the changes.");

  job.result = { scanId, scanned, autoApplied, queued, errors };
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
      case "refresh-genres":
        await runRefreshGenres();
        break;
      case "beets-doctor":
        await runBeetsDoctor();
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

const VALID_ACTIONS = ["clean-missing", "refresh-metadata", "fetch-artwork", "refresh-genres", "beets-doctor"];

export async function POST(request: NextRequest) {
  const job = g.job;

  if (job && job.status === "running") {
    return NextResponse.json(
      { error: "A housekeeping job is already running", action: job.action, jobId: job.id },
      { status: 409 }
    );
  }

  const body = await request.json();
  const { action, planOnly } = body;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Use: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const jobId = `housekeeping-${Date.now()}`;

  const logFilePath = openJobLogFile(jobId, action);

  g.job = {
    id: jobId,
    action,
    status: "running",
    total: 0,
    current: 0,
    logs: [],
    startedAt: Date.now(),
    logFilePath,
    options: { planOnly: Boolean(planOnly) },
  };

  log(`Housekeeping started: ${action}`);
  if (logFilePath) log(`Log file: ${path.relative(process.cwd(), logFilePath)}`);
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
