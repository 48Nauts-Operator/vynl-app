// BeetsAI Doctor — apply pipeline.
//
// Thin wrappers around the `beet` CLI with before/after snapshots so the
// runner can log a meaningful audit record per change. All wrappers spawn
// the beets venv binary directly (Next process PATH doesn't reliably
// include /usr/local/bin — same fix we use elsewhere in the codebase).

import { spawn } from "child_process";
import Database from "better-sqlite3";
import { db as vynlDb } from "@/lib/db";

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
  /** Number of Vynl tracks rows updated by the inline sync helper.
   *  null = sync wasn't attempted; 0 = attempted but matched no rows
   *  (likely an album-name mismatch between beets and Vynl). */
  vynlRowsUpdated?: number | null;
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

  // Normalize: some LLMs (minimax-m2 observed) drop the "modify" verb
  // and start args directly with "-y" or "album:...". Inject it back in
  // so the command actually runs. Also reject if the LLM tried to slip
  // in a different verb (e.g. "remove", "update", "import") — those
  // need their own apply path.
  const SAFE_PREPEND = new Set(["-y", "--yes", "-a", "--album"]);
  if (args.length === 0) {
    return { success: false, before, error: "applyModify got empty args" };
  }
  let normalized = args;
  if (args[0] !== "modify") {
    if (SAFE_PREPEND.has(args[0]) || args[0].includes(":") || args[0].includes("=")) {
      // Looks like flags/query/assignment — LLM forgot the verb. Add it.
      normalized = ["modify", ...args];
    } else {
      return {
        success: false,
        before,
        error: `applyModify only handles modify commands, got first arg: ${args[0]}`,
      };
    }
  }

  const result = await runBeet(normalized);
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
  const renameArg = normalized.find((a) => a.startsWith("album="));
  const newAlbumName = renameArg ? renameArg.slice("album=".length) : albumName;

  // Push the change out to file tags so the audio files reflect what
  // beets just recorded. Without this the FS still has the old TCMP /
  // albumartist tags and Vynl's next Refresh Metadata pass would
  // overwrite the beets change. Failure here is logged but non-fatal
  // — the beets DB is still updated.
  const writeResult = await runBeet(["write", `album:${newAlbumName}`]);
  const writeOk = writeResult.exitCode === 0;

  // Sync Vynl's tracks table for this album so the UI reflects the
  // change immediately without requiring a full Refresh Metadata
  // sweep. We translate any field=value pairs from the LLM's args
  // into a Drizzle update. Renames are also applied so the row
  // matches on the new album name afterwards.
  const vynlRowsUpdated = syncVynlTracksFromArgs(normalized, albumName);

  const after = snapshotAlbum(newAlbumName);

  return {
    success: true,
    before,
    after,
    stdout: result.stdout.slice(-2000),
    stderr: result.stderr.slice(-1000) + (writeOk ? "" : ` [beet write failed: ${writeResult.stderr.slice(-500)}]`),
    exitCode: result.exitCode,
    vynlRowsUpdated,
  };
}

/** Mirror a beet-modify into Vynl's tracks table so the UI doesn't show
 *  stale data until the next full Refresh Metadata. Translates the
 *  field=value pairs we recognise; unknown fields are skipped silently
 *  (they'll catch up on the next refresh).
 *
 *  Mapping:
 *    albumartist=X   -> tracks.album_artist
 *    comp=1 / comp=0 -> tracks.is_compilation
 *    genres=X        -> tracks.genre  (Vynl stores one primary)
 *    album=X         -> tracks.album  (rename; matched on old name)
 *    year=NNNN       -> tracks.year
 */
function syncVynlTracksFromArgs(args: string[], oldAlbumName: string): number | null {
  const set: Record<string, string | number | boolean | null> = {};
  let newAlbum: string | null = null;
  for (const a of args) {
    const eq = a.indexOf("=");
    if (eq < 0) continue;
    const key = a.slice(0, eq);
    const val = a.slice(eq + 1);
    switch (key) {
      case "albumartist":
        set.album_artist = val;
        break;
      case "comp":
        set.is_compilation = val === "1" || val.toLowerCase() === "true" ? 1 : 0;
        break;
      case "genres":
      case "genre":
        set.genre = val;
        break;
      case "year":
        set.year = parseInt(val, 10) || null;
        break;
      case "album":
        newAlbum = val;
        set.album = val;
        break;
    }
  }
  void newAlbum;
  if (Object.keys(set).length === 0) return null;
  try {
    const setClauses = Object.keys(set)
      .map((k) => `${k} = ?`)
      .join(", ");
    const values = Object.values(set);
    const stmt = `UPDATE tracks SET ${setClauses} WHERE album = ?`;
    // Go through the underlying better-sqlite3 client for parameterised
    // execution — simpler than Drizzle's column-name field map for an
    // update keyed on snake_case columns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sqlite = (vynlDb as any).session?.client || (vynlDb as any).$client;
    if (!sqlite) {
      console.warn("syncVynlTracksFromArgs: could not obtain underlying sqlite client");
      return null;
    }
    const result = sqlite.prepare(stmt).run(...values, oldAlbumName);
    return typeof result.changes === "number" ? result.changes : null;
  } catch (err) {
    // Sync failure is non-fatal; next Refresh Metadata will reconcile.
    console.error("syncVynlTracksFromArgs failed:", err);
    return null;
  }
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
