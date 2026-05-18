// BeetsAI Doctor — apply pipeline.
//
// Thin wrappers around the `beet` CLI with before/after snapshots so the
// runner can log a meaningful audit record per change. All wrappers spawn
// the beets venv binary directly (Next process PATH doesn't reliably
// include /usr/local/bin — same fix we use elsewhere in the codebase).

import { spawn } from "child_process";
import Database from "better-sqlite3";

// In Docker the beets venv lives at /opt/vynl-venv/bin/beet; on Mac dev
// it's usually wherever `which beet` resolves. BEETS_BIN env var lets you
// pin it explicitly.
const BEET_BIN = process.env.BEETS_BIN || "/opt/vynl-venv/bin/beet";
const BEETS_DB = process.env.BEETS_DB_PATH || "/music/library.db";

export interface ApplyResult {
  success: boolean;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  error?: string;
}

/** Run `beet <args>` and capture stdout/stderr. */
async function runBeet(args: string[], timeoutMs = 60_000): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const proc = spawn(BEET_BIN, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    const killer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);
    proc.on("error", (err) => {
      clearTimeout(killer);
      resolve({ exitCode: null, stdout, stderr: stderr + String(err) });
    });
    proc.on("close", (code) => {
      clearTimeout(killer);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

/** Snapshot the relevant fields of an album's tracks before/after a fix.
 *  Reads from the beets DB directly (faster than `beet ls`). */
export function snapshotAlbum(albumName: string): Record<string, unknown> {
  const db = new Database(BEETS_DB, { readonly: true });
  try {
    const items = db
      .prepare(
        `SELECT id, album, albumartist, artist, comp, genres, year, disc
         FROM items WHERE album = ? LIMIT 200`
      )
      .all(albumName) as Array<Record<string, unknown>>;
    return {
      album: albumName,
      trackCount: items.length,
      distinctAlbumArtists: Array.from(
        new Set(items.map((i) => i.albumartist as string))
      ),
      compFlags: Array.from(new Set(items.map((i) => i.comp as number))),
      genres: Array.from(new Set(items.map((i) => i.genres as string))),
      sampleIds: items.slice(0, 5).map((i) => i.id),
    };
  } finally {
    db.close();
  }
}

/** Generic apply: takes the args the LLM proposed and runs them. Snapshots
 *  the album state before + after so the audit record has a meaningful
 *  diff. Used for compilation fixes and most genre/field changes. */
export async function applyModify(
  args: string[],
  albumName: string
): Promise<ApplyResult> {
  const before = snapshotAlbum(albumName);

  // Sanity: first arg must be "modify" (the only command we apply this way).
  if (args[0] !== "modify") {
    return {
      success: false,
      before,
      error: `applyModify only handles modify commands, got: ${args[0]}`,
    };
  }

  const result = await runBeet(args);
  if (result.exitCode !== 0) {
    return {
      success: false,
      before,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      error: `beet exited with code ${result.exitCode}`,
    };
  }

  // After-snapshot uses the NEW album name if the modify renamed it.
  // Detect by scanning args for "album=NEW" assignment.
  const renameArg = args.find((a) => a.startsWith("album="));
  const newAlbumName = renameArg ? renameArg.slice("album=".length) : albumName;
  const after = snapshotAlbum(newAlbumName);

  return {
    success: true,
    before,
    after,
    stdout: result.stdout.slice(-2000),
    stderr: result.stderr.slice(-1000),
    exitCode: result.exitCode,
  };
}

/** Delete an item from the beets DB. `-d` would also delete the file —
 *  we deliberately omit it here so source files are never touched.
 *  Used by junk-cleanup for orphan/broken entries.
 *  args expected: ["remove", "-y", "id:NNN"]  (the -d flag must NOT be there.) */
export async function applyRemove(args: string[]): Promise<ApplyResult> {
  if (args[0] !== "remove") {
    return { success: false, error: `applyRemove expects remove, got: ${args[0]}` };
  }
  // Safety: strip -d / --delete if the LLM included it. We only ever
  // remove from beets DB; never from disk.
  const safeArgs = args.filter((a) => a !== "-d" && a !== "--delete");
  const result = await runBeet(safeArgs);
  return {
    success: result.exitCode === 0,
    stdout: result.stdout.slice(-2000),
    stderr: result.stderr.slice(-1000),
    exitCode: result.exitCode,
    error:
      result.exitCode === 0
        ? undefined
        : `beet remove exited with code ${result.exitCode}`,
  };
}

/** Push beets DB values out to the file tags. Run after any modify that
 *  changed user-visible metadata so source files reflect the change. */
export async function applyWrite(query: string): Promise<ApplyResult> {
  const result = await runBeet(["write", query]);
  return {
    success: result.exitCode === 0,
    stdout: result.stdout.slice(-2000),
    stderr: result.stderr.slice(-1000),
    exitCode: result.exitCode,
    error:
      result.exitCode === 0
        ? undefined
        : `beet write exited with code ${result.exitCode}`,
  };
}
