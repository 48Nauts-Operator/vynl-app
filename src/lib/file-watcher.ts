/**
 * File Watcher — watches download directories for music folders,
 * imports via beet, rescans library, reconciles wishlist, and optionally
 * deletes the source folder on success.
 *
 * On start: scans ALL existing folders in the watch paths and queues them.
 * Ongoing: watches for new folders appearing and queues those too.
 * Audio detection is fully recursive — handles any folder depth.
 *
 * Uses globalThis for HMR persistence (Next.js dev mode).
 */

import chokidar from "chokidar";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

const AUDIO_EXTENSIONS = new Set([".flac", ".mp3", ".m4a", ".wav", ".ogg"]);

// ── Types ──

export interface WatcherConfig {
  watchPaths: string[];
  debounceSeconds: number;
  autoDeleteOnSuccess: boolean;
}

interface QueueItem {
  folderPath: string;
  addedAt: number;
}

interface ProcessedItem {
  folderPath: string;
  status: "success" | "failed";
  importedTracks: number;
  error?: string;
  processedAt: number;
}

export interface WatcherEvent {
  timestamp: number;
  level: "info" | "success" | "warn" | "error";
  message: string;
}

interface WatcherState {
  running: boolean;
  config: WatcherConfig;
  watcher: ReturnType<typeof chokidar.watch> | null;
  queue: QueueItem[];
  processing: boolean;
  processed: ProcessedItem[];
  lastActivity: number | null;
  debounceTimers: Map<string, NodeJS.Timeout>;
  eventLog: WatcherEvent[];
}

// ── globalThis persistence for HMR ──

const _g = globalThis as unknown as { __vynl_fileWatcher?: WatcherState };

function getState(): WatcherState | undefined {
  return _g.__vynl_fileWatcher;
}

function initState(config: WatcherConfig): WatcherState {
  const state: WatcherState = {
    running: false,
    config,
    watcher: null,
    queue: [],
    processing: false,
    processed: [],
    lastActivity: null,
    debounceTimers: new Map(),
    eventLog: [],
  };
  _g.__vynl_fileWatcher = state;
  return state;
}

/** Push an event to the log (keeps last 50) */
function logEvent(state: WatcherState, level: WatcherEvent["level"], message: string) {
  state.eventLog.push({ timestamp: Date.now(), level, message });
  if (state.eventLog.length > 50) {
    state.eventLog = state.eventLog.slice(-50);
  }
  state.lastActivity = Date.now();
  const prefix = "[FileWatcher]";
  if (level === "error") console.error(prefix, message);
  else console.log(prefix, message);
}

// ── Helpers ──

/** Recursively check if a directory (at any depth) contains audio files */
function containsAudioFiles(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) return true;
      }
      if (entry.isDirectory()) {
        // Recurse into subdirectories — any depth
        if (containsAudioFiles(path.join(dirPath, entry.name))) return true;
      }
    }
  } catch {
    // Directory might have been deleted or permission denied
  }
  return false;
}

/** Remove a directory recursively */
function rmDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * Scan a watch path for existing top-level folders.
 * Does NOT check for audio files here — that's too slow over NAS for 900+ folders.
 * We queue everything and let beet handle the filtering during import.
 */
function scanExistingFolders(watchPath: string): string[] {
  const folders: string[] = [];
  try {
    const entries = fs.readdirSync(watchPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        folders.push(path.join(watchPath, entry.name));
      }
    }
  } catch {
    // Watch path might not be accessible
  }
  return folders;
}

// ── Import pipeline ──

/** How many folders to beet-import before doing a single rescan + reconciliation */
const BATCH_SIZE = 20;

/** Import a single folder via beet (no rescan/reconciliation — that happens at batch level) */
async function beetImportFolder(
  state: WatcherState,
  folderPath: string,
): Promise<ProcessedItem> {
  const folderName = path.basename(folderPath);
  const result: ProcessedItem = {
    folderPath,
    status: "failed",
    importedTracks: 0,
    processedAt: Date.now(),
  };

  try {
    const Database = (await import("better-sqlite3")).default;
    const beetsDbPath =
      process.env.BEETS_DB_PATH ||
      path.join(os.homedir(), ".config", "beets", "library.db");

    let countBefore = 0;
    try {
      const bdb = new Database(beetsDbPath);
      const row = bdb
        .prepare("SELECT COUNT(*) as count FROM items")
        .get() as { count: number };
      bdb.close();
      countBefore = row.count;
    } catch {}

    // beet import -q --move (beet recurses into all subdirs)
    logEvent(state, "info", `Importing: beet import -q --move "${folderName}"`);
    try {
      await execFileAsync("beet", ["import", "-q", "--move", folderPath], {
        timeout: 300000,
      });
    } catch {
      // beet may exit non-zero on warnings, continue
    }

    let countAfter = 0;
    try {
      const bdb = new Database(beetsDbPath);
      const row = bdb
        .prepare("SELECT COUNT(*) as count FROM items")
        .get() as { count: number };
      bdb.close();
      countAfter = row.count;
    } catch {}

    // If auto-tag imported nothing, retry with --noautotag
    if (countAfter === countBefore) {
      logEvent(state, "warn", `Auto-tag found nothing, retrying with --noautotag: "${folderName}"`);
      try {
        await execFileAsync(
          "beet",
          ["import", "--noautotag", "--move", folderPath],
          { timeout: 300000 }
        );
      } catch {}

      try {
        const bdb = new Database(beetsDbPath);
        const row = bdb
          .prepare("SELECT COUNT(*) as count FROM items")
          .get() as { count: number };
        bdb.close();
        countAfter = row.count;
      } catch {}
    }

    result.importedTracks = countAfter - countBefore;
    result.status = "success";
    logEvent(state, result.importedTracks > 0 ? "success" : "warn",
      `Beet imported ${result.importedTracks} tracks from "${folderName}"`);
  } catch (err) {
    result.error = String(err);
    logEvent(state, "error", `Failed to import "${folderName}": ${err}`);
  }

  return result;
}

/** Run library rescan + wishlist reconciliation once (shared across batch) */
async function rescanAndReconcile(state: WatcherState): Promise<void> {
  const baseUrl = process.env.VYNL_HOST || "http://localhost:3101";

  logEvent(state, "info", "Rescanning library...");
  try {
    await fetch(`${baseUrl}/api/library/scan?adapter=beets`, { method: "POST" });
    logEvent(state, "success", "Library rescan complete");
  } catch (err) {
    logEvent(state, "error", `Library scan failed: ${err}`);
  }

  logEvent(state, "info", "Reconciling wishlist...");
  try {
    const res = await fetch(`${baseUrl}/api/wishlist/reconcile`, { method: "POST" });
    const data = await res.json();
    if (data.matched > 0) {
      logEvent(state, "success", `Wishlist: ${data.matched}/${data.totalItems} items matched`);
    } else {
      logEvent(state, "info", `Wishlist: 0 new matches (${data.totalItems} pending)`);
    }
  } catch (err) {
    logEvent(state, "error", `Wishlist reconciliation failed: ${err}`);
  }
}

// ── Queue processor (batch-oriented) ──

async function processQueue(state: WatcherState): Promise<void> {
  if (state.processing || state.queue.length === 0) return;
  state.processing = true;

  while (state.queue.length > 0 && state.running) {
    // ── Import a batch of folders ──
    const batchSize = Math.min(BATCH_SIZE, state.queue.length);
    const batch = state.queue.splice(0, batchSize);
    const totalTracksInBatch: number[] = [];
    const successFolders: string[] = [];

    logEvent(state, "info",
      `Starting batch of ${batch.length} folders (${state.queue.length} remaining after this batch)`);

    for (const item of batch) {
      // Check cancellation between each folder
      if (!state.running) {
        logEvent(state, "warn", "Cancelled — stopping mid-batch");
        break;
      }

      const folderName = path.basename(item.folderPath);
      logEvent(state, "info", `[${totalTracksInBatch.length + 1}/${batch.length}] "${folderName}"`);

      const result = await beetImportFolder(state, item.folderPath);

      totalTracksInBatch.push(result.importedTracks);
      state.processed.push(result);
      if (state.processed.length > 100) {
        state.processed = state.processed.slice(-100);
      }

      if (result.status === "success" && result.importedTracks > 0) {
        successFolders.push(item.folderPath);
      }
    }

    // Skip rescan/cleanup if cancelled
    if (!state.running) break;

    const totalTracks = totalTracksInBatch.reduce((a, b) => a + b, 0);
    logEvent(state, "success",
      `Batch complete: ${batch.length} folders, ${totalTracks} tracks imported`);

    // ── Single rescan + reconciliation for the entire batch ──
    if (totalTracks > 0) {
      await rescanAndReconcile(state);
    } else {
      logEvent(state, "info", "No new tracks in batch — skipping rescan");
    }

    // ── Delete source folders for successful imports ──
    if (state.config.autoDeleteOnSuccess) {
      for (const folderPath of successFolders) {
        try {
          if (fs.existsSync(folderPath)) {
            rmDir(folderPath);
            logEvent(state, "info", `Deleted source: "${path.basename(folderPath)}"`);
          }
        } catch {}
      }
    }
  }

  state.processing = false;
  if (state.running) {
    logEvent(state, "info", "Queue empty — watching for new folders...");
  } else {
    logEvent(state, "info", `Processing stopped (${state.queue.length} items remain in queue)`);
  }
}

// ── Public API ──

export function startWatcher(config: WatcherConfig): {
  success: boolean;
  error?: string;
} {
  let state = getState();
  if (state?.running) {
    return { success: false, error: "Watcher already running" };
  }

  const validPaths = config.watchPaths.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });

  if (validPaths.length === 0) {
    return { success: false, error: "No valid watch paths" };
  }

  state = initState(config);
  state.running = true;

  logEvent(state, "success", `Watching ${validPaths.length} path(s): ${validPaths.map(p => path.basename(p)).join(", ")}`);

  // ── Phase 1: Scan existing folders and queue them (non-blocking) ──
  // Use setTimeout so the API response returns immediately
  setTimeout(() => {
    if (!state!.running) return;
    let existingCount = 0;
    for (const wp of validPaths) {
      logEvent(state!, "info", `Scanning existing folders in "${path.basename(wp)}"...`);
      const existing = scanExistingFolders(wp);
      for (const folder of existing) {
        state!.queue.push({ folderPath: folder, addedAt: Date.now() });
        existingCount++;
      }
    }

    if (existingCount > 0) {
      logEvent(state!, "info", `Found ${existingCount} existing folder(s) — queued for import`);
      processQueue(state!);
    } else {
      logEvent(state!, "info", "No existing folders found — watching for new ones...");
    }
  }, 0);

  // ── Phase 2: Watch for new folders going forward ──
  const watcher = chokidar.watch(validPaths, {
    depth: 0, // Detect new top-level entries
    ignoreInitial: true, // We already scanned existing above
    ignorePermissionErrors: true,
  });

  watcher.on("addDir", (dirPath: string) => {
    // Ignore the root watch paths themselves
    if (validPaths.includes(dirPath)) return;

    const folderName = path.basename(dirPath);
    logEvent(state!, "info", `Detected new folder: "${folderName}" — debouncing ${config.debounceSeconds}s...`);

    // Debounce: wait for download to stabilize
    const existing = state!.debounceTimers.get(dirPath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      state!.debounceTimers.delete(dirPath);

      if (!fs.existsSync(dirPath)) {
        logEvent(state!, "warn", `Folder disappeared before processing: "${folderName}"`);
        return;
      }
      // Recursive audio check — any depth
      if (!containsAudioFiles(dirPath)) {
        logEvent(state!, "warn", `Skipped (no audio files found at any depth): "${folderName}"`);
        return;
      }

      // Don't re-queue if already in queue
      const alreadyQueued = state!.queue.some(
        (q) => q.folderPath === dirPath
      );
      if (alreadyQueued) return;

      logEvent(state!, "info", `Queued for import: "${folderName}"`);
      state!.queue.push({ folderPath: dirPath, addedAt: Date.now() });
      processQueue(state!);
    }, config.debounceSeconds * 1000);

    state!.debounceTimers.set(dirPath, timer);
  });

  state.watcher = watcher;
  return { success: true };
}

export function stopWatcher(): { success: boolean } {
  const state = getState();
  if (!state?.running) {
    return { success: false };
  }

  // Signal cancellation first — processQueue checks this flag
  state.running = false;

  // Clear the queue so nothing restarts
  const dropped = state.queue.length;
  state.queue = [];

  // Clear all debounce timers
  for (const timer of state.debounceTimers.values()) {
    clearTimeout(timer);
  }
  state.debounceTimers.clear();

  // Close chokidar watcher
  if (state.watcher) {
    state.watcher.close();
    state.watcher = null;
  }

  logEvent(state, "info", `Watcher stopped${dropped > 0 ? ` (${dropped} queued items cancelled)` : ""}`);
  return { success: true };
}

export function getWatcherStatus(): {
  running: boolean;
  config: WatcherConfig | null;
  queueLength: number;
  processing: boolean;
  processedCount: number;
  lastActivity: number | null;
  recentProcessed: ProcessedItem[];
  eventLog: WatcherEvent[];
} {
  const state = getState();
  if (!state) {
    return {
      running: false,
      config: null,
      queueLength: 0,
      processing: false,
      processedCount: 0,
      lastActivity: null,
      recentProcessed: [],
      eventLog: [],
    };
  }

  return {
    running: state.running,
    config: state.config,
    queueLength: state.queue.length,
    processing: state.processing,
    processedCount: state.processed.length,
    lastActivity: state.lastActivity,
    recentProcessed: state.processed.slice(-10),
    eventLog: state.eventLog.slice(-30),
  };
}
