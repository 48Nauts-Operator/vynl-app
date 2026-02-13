import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import Database from "better-sqlite3";

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".flac", ".wav", ".ogg", ".aac", ".wma"]);

const MAX_LOG_LINES = 500;

interface FolderResult {
  folder: string;
  success: boolean;
  tracks?: number;
  error?: string;
  cleaned?: boolean;
  elapsed?: number;
}

// Job state type
interface ImportJob {
  id: string;
  status: "running" | "complete" | "error" | "cancelled";
  total: number;
  current: number;
  currentFolder: string;
  results: FolderResult[];
  logs: string[];
  postProcessing: boolean;
  startedAt: number;
  folderStartedAt: number;
  completedAt?: number;
  error?: string;
}

// ── Persist state on globalThis so it survives Next.js dev-mode hot-reloads ──
// Module-level variables reset when the module is re-evaluated during HMR,
// but globalThis persists for the lifetime of the Node process.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (_g.importJob === undefined) _g.importJob = null;
if (_g.activeProcess === undefined) _g.activeProcess = null;

// Typed accessors for globalThis-persisted state
const g = {
  get importJob(): ImportJob | null { return _g.importJob; },
  set importJob(v: ImportJob | null) { _g.importJob = v; },
  get activeProcess(): ChildProcess | null { return _g.activeProcess; },
  set activeProcess(v: ChildProcess | null) { _g.activeProcess = v; },
};

/** Append a line to the job log buffer (ring buffer) */
function log(line: string) {
  const job = g.importJob;
  if (!job) return;
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
  job.logs.push(`[${ts}] ${line}`);
  if (job.logs.length > MAX_LOG_LINES) {
    job.logs = job.logs.slice(-MAX_LOG_LINES);
  }
}

function discoverImportFolders(basePath: string): string[] {
  const folders: string[] = [];

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });

    const hasAudioInRoot = entries.some(
      (e) => e.isFile() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase())
    );

    if (hasAudioInRoot) {
      folders.push(basePath);
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const subPath = path.join(basePath, entry.name);

      try {
        const subEntries = fs.readdirSync(subPath);
        const hasAudio = subEntries.some((f) =>
          AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase())
        );
        if (hasAudio) {
          folders.push(subPath);
        }

        for (const sub of subEntries) {
          const deepPath = path.join(subPath, sub);
          try {
            if (fs.statSync(deepPath).isDirectory()) {
              const deepEntries = fs.readdirSync(deepPath);
              if (deepEntries.some((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()))) {
                folders.push(deepPath);
              }
            }
          } catch {
            // Skip inaccessible
          }
        }
      } catch {
        // Skip inaccessible subdirectory
      }
    }
  } catch {
    // basePath not readable
  }

  return [...new Set(folders)];
}

/** Count audio files in a folder */
function countAudioFiles(folderPath: string): number {
  try {
    const entries = fs.readdirSync(folderPath);
    return entries.filter((f) => AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase())).length;
  } catch {
    return 0;
  }
}

/** Run beet import as a spawned process with live log streaming */
function runBeetImport(args: string[], folder: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("beet", args, {
      timeout: 600000, // 10 min timeout
      stdio: ["pipe", "pipe", "pipe"],
    });

    g.activeProcess = proc;

    // Close stdin immediately so beets never blocks waiting for interactive input (Y/n prompts)
    proc.stdin.end();

    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        const clean = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\[[\d;]*m/g, "").trim();
        if (clean) log(`  ${clean}`);
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        const clean = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\[[\d;]*m/g, "").trim();
        if (clean) log(`  ⚠ ${clean}`);
      }
    });

    proc.on("close", (code) => {
      g.activeProcess = null;
      resolve({ code: code ?? 1, stderr });
    });

    proc.on("error", (err) => {
      g.activeProcess = null;
      stderr += err.message;
      log(`  ✗ Process error: ${err.message}`);
      resolve({ code: 1, stderr });
    });
  });
}

/** Check if a directory is empty (no files, possibly empty subdirs) */
function isDirectoryEmpty(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) return false;
      if (entry.isDirectory()) {
        if (!isDirectoryEmpty(path.join(dirPath, entry.name))) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Recursively remove empty directories */
function removeEmptyDir(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    // First, clean up any empty subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        removeEmptyDir(path.join(dirPath, entry.name));
      }
    }
    // Check again after cleaning subdirs
    const remaining = fs.readdirSync(dirPath);
    if (remaining.length === 0) {
      fs.rmdirSync(dirPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Run the import in the background — not tied to any HTTP response */
async function runImportJob(folders: string[]) {
  const job = g.importJob;
  if (!job) return;

  const beetsDbPath = process.env.BEETS_DB_PATH || path.join(os.homedir(), ".config", "beets", "library.db");

  function getBeetsCount(): number {
    try {
      const bdb = new Database(beetsDbPath);
      const row = bdb.prepare("SELECT COUNT(*) as count FROM items").get() as { count: number };
      bdb.close();
      return row.count;
    } catch {
      return 0;
    }
  }

  try {
    for (let i = 0; i < folders.length; i++) {
      // Check for cancellation before starting each folder
      if (job.status === "cancelled") {
        log("");
        log("━━━ CANCELLED by user ━━━");
        const succeeded = job.results.filter((r) => r.success).length;
        const failed = job.results.filter((r) => !r.success).length;
        log(`${succeeded} succeeded, ${failed} failed before cancellation`);
        job.completedAt = Date.now();
        job.currentFolder = "";
        return;
      }

      const folder = folders[i];
      const folderName = path.basename(folder);
      const audioCount = countAudioFiles(folder);

      job.current = i + 1;
      job.currentFolder = folderName;
      job.folderStartedAt = Date.now();

      log(`━━━ [${i + 1}/${folders.length}] ${folderName} (${audioCount} audio files) ━━━`);

      const countBefore = getBeetsCount();

      let success = false;
      let importError = "";

      // Attempt 1: auto-tag with MusicBrainz
      log(`→ beet import -q --move "${folderName}"`);
      const result1 = await runBeetImport(["import", "-q", "--move", folder], folder);

      if (result1.code !== 0 && result1.stderr) {
        importError = result1.stderr;
      }

      let countAfter = getBeetsCount();
      let tracksImported = countAfter - countBefore;

      if (tracksImported > 0) {
        log(`✓ Auto-tagged: ${tracksImported} tracks imported`);
      } else {
        log(`→ Auto-tag found nothing, retrying with --noautotag...`);

        // Attempt 2: import with existing tags
        const result2 = await runBeetImport(["import", "--noautotag", "--move", folder], folder);

        if (result2.code !== 0 && result2.stderr) {
          importError = result2.stderr;
        }

        countAfter = getBeetsCount();
        tracksImported = countAfter - countBefore;

        if (tracksImported > 0) {
          log(`✓ Imported with existing tags: ${tracksImported} tracks`);
        } else {
          log(`✗ No tracks imported from this folder`);
        }
      }

      success = tracksImported > 0;

      // Cleanup: remove source folder if empty after import
      let cleaned = false;
      if (success) {
        if (isDirectoryEmpty(folder)) {
          cleaned = removeEmptyDir(folder);
          if (cleaned) {
            log(`🧹 Cleaned up empty source folder: ${folderName}`);
          }
        } else {
          // Count remaining files
          try {
            const remaining = fs.readdirSync(folder).length;
            log(`⚠ Source folder still has ${remaining} items, not removing`);
          } catch {
            // folder may already be gone
          }
        }
      }

      const elapsed = Date.now() - job.folderStartedAt;

      job.results.push({
        folder: folderName,
        success,
        tracks: tracksImported > 0 ? tracksImported : undefined,
        error: !success && importError ? importError : undefined,
        cleaned,
        elapsed,
      });

      log(`── Done in ${(elapsed / 1000).toFixed(1)}s ──`);
    }

    // Post-processing
    job.postProcessing = true;
    job.currentFolder = "Post-processing...";
    log("");
    log("━━━ Post-processing ━━━");
    log("→ Scanning library & syncing database...");

    const baseUrl = process.env.VYNL_HOST || "http://localhost:3101";
    try {
      const scanRes = await fetch(`${baseUrl}/api/library/scan?adapter=beets`, { method: "POST" });
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        log(`✓ Library scan: ${scanData.scanned || 0} scanned, ${scanData.added || 0} added`);
      } else {
        log(`⚠ Library scan returned ${scanRes.status}`);
      }
    } catch (err) {
      log(`⚠ Library scan failed: ${err}`);
    }

    log("→ Rescanning cover art...");
    try {
      const coverRes = await fetch(`${baseUrl}/api/library/housekeeping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan-covers" }),
      });
      if (coverRes.ok) {
        log("✓ Cover art rescan complete");
      } else {
        log(`⚠ Cover rescan returned ${coverRes.status}`);
      }
    } catch (err) {
      log(`⚠ Cover rescan failed: ${err}`);
    }

    const succeeded = job.results.filter((r) => r.success).length;
    const failed = job.results.filter((r) => !r.success).length;
    const totalTracks = job.results.reduce((sum, r) => sum + (r.tracks || 0), 0);

    log("");
    log(`━━━ COMPLETE ━━━`);
    log(`${succeeded} succeeded, ${failed} failed, ${totalTracks} total tracks imported`);

    job.status = "complete";
    job.postProcessing = false;
    job.completedAt = Date.now();
    job.currentFolder = "";
  } catch (err) {
    const j = g.importJob;
    if (j) {
      j.status = "error";
      j.error = String(err);
      j.completedAt = Date.now();
      log(`✗ Fatal error: ${err}`);
    }
  }
}

/** POST — kick off a new batch import job */
export async function POST(request: NextRequest) {
  const job = g.importJob;

  // Reject if a job is already running
  if (job && job.status === "running") {
    return NextResponse.json(
      {
        error: "A batch import is already running",
        jobId: job.id,
        current: job.current,
        total: job.total,
      },
      { status: 409 }
    );
  }

  const body = await request.json();
  const { path: importPath } = body;

  if (!importPath || typeof importPath !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  if (!fs.existsSync(importPath)) {
    return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
  }

  // Pre-flight: check that beets library directory is accessible (NAS must be mounted)
  const beetsDbPath = process.env.BEETS_DB_PATH || path.join(os.homedir(), ".config", "beets", "library.db");
  const beetsDbDir = path.dirname(beetsDbPath);
  if (!fs.existsSync(beetsDbDir)) {
    return NextResponse.json(
      { error: `Beets database directory not found: ${beetsDbDir}. Is the NAS mounted?` },
      { status: 503 }
    );
  }

  const folders = discoverImportFolders(importPath);

  if (folders.length === 0) {
    return NextResponse.json({ error: "No folders with audio files found" }, { status: 400 });
  }

  const jobId = `import-${Date.now()}`;

  g.importJob = {
    id: jobId,
    status: "running",
    total: folders.length,
    current: 0,
    currentFolder: "Starting...",
    results: [],
    logs: [],
    postProcessing: false,
    startedAt: Date.now(),
    folderStartedAt: Date.now(),
  };

  log(`Batch import started: ${folders.length} folders`);
  log(`Source: ${importPath}`);
  log("");

  // Fire and forget — runs in the background
  runImportJob(folders);

  return NextResponse.json({
    jobId,
    total: folders.length,
    folders: folders.map((f) => path.basename(f)),
    message: `Import started: ${folders.length} folders`,
  });
}

/** GET — poll for current job status */
export async function GET(request: NextRequest) {
  const job = g.importJob;

  if (!job) {
    return NextResponse.json({ status: "idle", message: "No import job running" });
  }

  const succeeded = job.results.filter((r) => r.success).length;
  const failed = job.results.filter((r) => !r.success).length;

  // Support log pagination: ?since=N returns logs from index N onward
  const url = new URL(request.url);
  const since = parseInt(url.searchParams.get("since") || "0", 10);
  const logs = job.logs.slice(since);

  // Elapsed time for currently-processing folder
  const folderElapsed = job.status === "running" && job.folderStartedAt
    ? Date.now() - job.folderStartedAt
    : undefined;

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    total: job.total,
    current: job.current,
    currentFolder: job.currentFolder,
    postProcessing: job.postProcessing,
    succeeded,
    failed,
    results: job.results,
    logs,
    logOffset: since,
    totalLogs: job.logs.length,
    folderElapsed,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
  });
}

/** DELETE — cancel the running import job */
export async function DELETE() {
  const job = g.importJob;

  if (!job || job.status !== "running") {
    return NextResponse.json({ error: "No running import to cancel" }, { status: 400 });
  }

  // Set the cancelled flag — the import loop checks this between folders
  job.status = "cancelled";
  log("⛔ Cancel requested by user");

  // Kill the currently running beet process immediately
  const proc = g.activeProcess;
  if (proc) {
    try {
      proc.kill("SIGTERM");
      log("⛔ Killed active beet process");
    } catch {
      // Process may have already exited
    }
  }

  return NextResponse.json({
    message: "Import cancellation requested",
    completed: job.results.length,
    remaining: job.total - job.results.length,
  });
}
