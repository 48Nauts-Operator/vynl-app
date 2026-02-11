import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import Database from "better-sqlite3";
const execFileAsync = promisify(execFile);

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".flac", ".wav", ".ogg", ".aac", ".wma"]);

// In-memory job state (survives across requests within the same server process)
let currentJob: {
  id: string;
  status: "running" | "complete" | "error";
  total: number;
  current: number;
  currentFolder: string;
  results: Array<{ folder: string; success: boolean; tracks?: number; error?: string }>;
  postProcessing: boolean;
  startedAt: number;
  completedAt?: number;
  error?: string;
} | null = null;

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

/** Run the import in the background — not tied to any HTTP response */
async function runImportJob(folders: string[]) {
  if (!currentJob) return;

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
      const folder = folders[i];
      const folderName = path.basename(folder);

      currentJob.current = i + 1;
      currentJob.currentFolder = folderName;

      const countBefore = getBeetsCount();

      let success = false;
      let importError = "";

      try {
        await execFileAsync("beet", ["import", "-q", "--move", folder], { timeout: 300000 });
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        importError = e.stderr || String(err);
      }

      let countAfter = getBeetsCount();
      let tracksImported = countAfter - countBefore;

      if (tracksImported === 0) {
        try {
          await execFileAsync("beet", ["import", "--noautotag", "--move", folder], { timeout: 300000 });
          countAfter = getBeetsCount();
          tracksImported = countAfter - countBefore;
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          importError = e.stderr || String(err);
        }
      }

      success = tracksImported > 0;

      currentJob.results.push({
        folder: folderName,
        success,
        tracks: tracksImported > 0 ? tracksImported : undefined,
        error: !success && importError ? importError.slice(0, 200) : undefined,
      });
    }

    // Post-processing
    currentJob.postProcessing = true;
    currentJob.currentFolder = "Post-processing...";

    const baseUrl = process.env.VYNL_HOST || "http://localhost:3101";
    try {
      await fetch(`${baseUrl}/api/library/scan?adapter=beets`, { method: "POST" });
      await fetch(`${baseUrl}/api/library/housekeeping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan-covers" }),
      });
    } catch {
      // Best-effort
    }

    currentJob.status = "complete";
    currentJob.postProcessing = false;
    currentJob.completedAt = Date.now();
    currentJob.currentFolder = "";
  } catch (err) {
    if (currentJob) {
      currentJob.status = "error";
      currentJob.error = String(err);
      currentJob.completedAt = Date.now();
    }
  }
}

/** POST — kick off a new batch import job */
export async function POST(request: NextRequest) {
  // Reject if a job is already running
  if (currentJob && currentJob.status === "running") {
    return NextResponse.json(
      {
        error: "A batch import is already running",
        jobId: currentJob.id,
        current: currentJob.current,
        total: currentJob.total,
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

  const folders = discoverImportFolders(importPath);

  if (folders.length === 0) {
    return NextResponse.json({ error: "No folders with audio files found" }, { status: 400 });
  }

  const jobId = `import-${Date.now()}`;

  currentJob = {
    id: jobId,
    status: "running",
    total: folders.length,
    current: 0,
    currentFolder: "Starting...",
    results: [],
    postProcessing: false,
    startedAt: Date.now(),
  };

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
export async function GET() {
  if (!currentJob) {
    return NextResponse.json({ status: "idle", message: "No import job running" });
  }

  const succeeded = currentJob.results.filter((r) => r.success).length;
  const failed = currentJob.results.filter((r) => !r.success).length;

  return NextResponse.json({
    jobId: currentJob.id,
    status: currentJob.status,
    total: currentJob.total,
    current: currentJob.current,
    currentFolder: currentJob.currentFolder,
    postProcessing: currentJob.postProcessing,
    succeeded,
    failed,
    results: currentJob.results,
    startedAt: currentJob.startedAt,
    completedAt: currentJob.completedAt,
    error: currentJob.error,
  });
}
