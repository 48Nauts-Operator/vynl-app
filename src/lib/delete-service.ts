/**
 * FireStorage — Vynl's universal soft-delete sink.
 *
 * ALL deletions in Vynl go through this module. No code outside this file
 * should call `fs.rm`, `fs.unlink`, `fs.rmdir`, `DELETE FROM`, `DROP`, or
 * Drizzle's `db.delete(...)` directly. If you find yourself wanting to,
 * call `deleteService.moveToFireStorage(...)` instead.
 *
 * Spec:
 *   - Files copied into FIRESTORAGE_ROOT/<entry-id>/files/ before removal
 *   - DB rows snapshotted as JSON into the entry's snapshot_json column
 *     before being deleted from the live table
 *   - Each entry has an expires_at; auto-purged after retention window
 *   - Restore is a single file move (rename) + JSON re-insert — instant
 *   - Audit log entry written for every delete / restore / purge / error
 *
 * RULE #1: see project memory [[no-destruction-without-failsafes]] +
 * [[firestorage]]. Forgejo #6561 is the umbrella issue.
 */

import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import {
  firestorageEntries,
  destructiveActions,
  type FirestorageEntry,
} from "@/lib/db/schema";
import { eq, and, lt, sql as drizzleSql } from "drizzle-orm";
import { getSettingOrEnv } from "@/lib/app-settings";

// ---- Configuration --------------------------------------------------------

const DEFAULT_RETENTION_DAYS = 90;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;
const DEFAULT_ROOT = "/volume1/Tron/Vynl/firestorage";

/** Resolve the configured FireStorage root, creating it on first use. */
function getFireStorageRoot(): string {
  const override = process.env.VYNL_FIRESTORAGE_ROOT;
  const root = override || DEFAULT_ROOT;
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (err) {
    // Best-effort — caller will see a clear error on the actual write
    console.error(`[firestorage] could not mkdir ${root}:`, err);
  }
  return root;
}

/** Retention days from settings, clamped to [MIN, MAX]. */
function getRetentionDays(): number {
  try {
    const raw = getSettingOrEnv("firestorageRetentionDays", "VYNL_FIRESTORAGE_RETENTION_DAYS");
    const n = parseInt(raw || "", 10);
    if (Number.isFinite(n)) {
      return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, n));
    }
  } catch {}
  return DEFAULT_RETENTION_DAYS;
}

/** Whether the auto-purge sweeper is paused (paranoid mode). */
function isAutoPurgePaused(): boolean {
  try {
    const raw = getSettingOrEnv("firestoragePauseAutoPurge", "VYNL_FIRESTORAGE_PAUSE_AUTO_PURGE");
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

// ---- Types ----------------------------------------------------------------

export type OriginAction =
  | "user_delete"
  | "duplicate_clean"
  | "spotify_wipe"
  | "playlist_delete"
  | "podcast_delete"
  | "wishlist_delete"
  | "rating_clear"
  | "album_rule_delete"
  | "intel_refresh"
  | "api_key_delete"
  | "track_archive";

export interface MoveToFireStorageInput {
  action: OriginAction;
  description: string;
  /** Absolute file paths to move into FireStorage. Optional. */
  files?: string[];
  /** DB rows to snapshot + delete after move. Optional. */
  dbRows?: Array<{
    table: string;
    rowId: number | string;
    snapshot: Record<string, unknown>;
    /** Drizzle delete fn. Run AFTER snapshot is written. */
    deleteFn: () => void;
  }>;
  /** Free-form metadata stored on the entry (track id, playlist name, etc). */
  metadata?: Record<string, unknown>;
}

export interface MoveToFireStorageResult {
  entryId: number;
  storagePath: string;
  expiresAt: string;
  byteCount: number;
}

// ---- Audit log helpers ----------------------------------------------------

function writeAudit(input: {
  action: "delete" | "restore" | "purge" | "expiry_purge";
  firestorageEntryId?: number;
  description: string;
  initiator: "ui" | "expiry_sweeper";
  result: "success" | "failed";
  errorMessage?: string;
  byteCount?: number;
}): void {
  try {
    db.insert(destructiveActions)
      .values({
        action: input.action,
        firestorageEntryId: input.firestorageEntryId,
        description: input.description,
        initiator: input.initiator,
        result: input.result,
        errorMessage: input.errorMessage,
        byteCount: input.byteCount || 0,
      })
      .run();
  } catch (err) {
    console.error("[firestorage] audit write failed:", err);
  }
}

// ---- Internal helpers -----------------------------------------------------

function newEntryFolderName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = randomBytes(4).toString("hex");
  return `${ts}_${rand}`;
}

function copyFilePreserve(src: string, dst: string): number {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  const stat = fs.statSync(dst);
  // Lock the FireStorage copy down — owner read-only. Restore re-chmods.
  try { fs.chmodSync(dst, 0o444); } catch {}
  return stat.size;
}

function safeFileSize(p: string): number {
  try { return fs.statSync(p).size; } catch { return 0; }
}

// ---- Public API -----------------------------------------------------------

export const deleteService = {
  /**
   * Move files + DB rows into FireStorage. This is the ONLY way deletion
   * happens in Vynl. Returns the created entry id, the storage path, and
   * the expiry timestamp.
   *
   * On any error during the file copy, the live state is left untouched
   * and a failed audit entry is written.
   */
  moveToFireStorage(
    input: MoveToFireStorageInput
  ): MoveToFireStorageResult {
    const root = getFireStorageRoot();
    const retentionDays = getRetentionDays();
    const entryFolder = newEntryFolderName();
    const storageDir = path.join(root, entryFolder);
    const filesDir = path.join(storageDir, "files");

    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000
    );

    // PHASE 1 — copy files into FireStorage. If anything fails, we abort
    // BEFORE touching the originals.
    let byteCount = 0;
    const copiedTargets: string[] = [];
    try {
      if (input.files && input.files.length > 0) {
        fs.mkdirSync(filesDir, { recursive: true });
        for (const src of input.files) {
          const baseName = path.basename(src);
          const dst = path.join(filesDir, baseName);
          byteCount += copyFilePreserve(src, dst);
          copiedTargets.push(dst);
        }
      }
    } catch (err) {
      // Cleanup any partial copies — the originals are untouched.
      for (const t of copiedTargets) {
        try { fs.chmodSync(t, 0o644); fs.unlinkSync(t); } catch {}
      }
      try { fs.rmdirSync(filesDir, { recursive: true } as any); } catch {}
      writeAudit({
        action: "delete",
        description: input.description,
        initiator: "ui",
        result: "failed",
        errorMessage: `file copy failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }

    // PHASE 2 — write the entry row with all snapshot data, so we have a
    // durable record before we touch live files/rows.
    const snapshotJson = input.dbRows && input.dbRows.length > 0
      ? JSON.stringify(
          input.dbRows.map((r) => ({
            table: r.table,
            rowId: r.rowId,
            snapshot: r.snapshot,
          }))
        )
      : null;

    const insertResult = db.insert(firestorageEntries).values({
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      originAction: input.action,
      originPath: input.files?.[0] || null,
      originTable: input.dbRows?.[0]?.table || null,
      originRowId: input.dbRows?.[0]?.rowId != null
        ? Number(input.dbRows[0].rowId) || null
        : null,
      storagePath: storageDir,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      snapshotJson,
      status: "held",
      sizeBytes: byteCount,
    }).run();
    const entryId = Number(insertResult.lastInsertRowid);

    // PHASE 3 — now remove originals (files first, then DB rows). If a
    // step here fails, the FireStorage entry stays (recoverable) and the
    // audit log records the partial state.
    try {
      if (input.files) {
        for (const src of input.files) {
          try { fs.unlinkSync(src); } catch (err) {
            console.error(`[firestorage] could not remove original ${src}:`, err);
          }
        }
      }
      if (input.dbRows) {
        for (const row of input.dbRows) {
          row.deleteFn();
        }
      }
    } catch (err) {
      writeAudit({
        action: "delete",
        firestorageEntryId: entryId,
        description: `${input.description} (partial — original removal failed)`,
        initiator: "ui",
        result: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        byteCount,
      });
      throw err;
    }

    writeAudit({
      action: "delete",
      firestorageEntryId: entryId,
      description: input.description,
      initiator: "ui",
      result: "success",
      byteCount,
    });

    return {
      entryId,
      storagePath: storageDir,
      expiresAt: expiresAt.toISOString(),
      byteCount,
    };
  },

  /** List held entries (newest first), optionally filtered by status. */
  list(opts: { status?: "held" | "restored" | "purged"; limit?: number } = {}) {
    const status = opts.status || "held";
    const limit = opts.limit || 200;
    return db
      .select()
      .from(firestorageEntries)
      .where(eq(firestorageEntries.status, status))
      .orderBy(drizzleSql`${firestorageEntries.createdAt} DESC`)
      .limit(limit)
      .all() as FirestorageEntry[];
  },

  /** Total bytes currently held in FireStorage. */
  heldBytes(): number {
    const row = db
      .select({
        bytes: drizzleSql<number>`COALESCE(SUM(${firestorageEntries.sizeBytes}), 0)`,
      })
      .from(firestorageEntries)
      .where(eq(firestorageEntries.status, "held"))
      .get();
    return Number(row?.bytes || 0);
  },

  /**
   * Restore an entry — moves files back to their original paths and
   * re-inserts DB rows. Restore is non-destructive; no 2FA required.
   * Idempotent — already-restored entries are a no-op.
   */
  restore(entryId: number): { restored: number; warnings: string[] } {
    const entry = db
      .select()
      .from(firestorageEntries)
      .where(eq(firestorageEntries.id, entryId))
      .get() as FirestorageEntry | undefined;
    if (!entry) throw new Error(`FireStorage entry ${entryId} not found`);
    if (entry.status !== "held") {
      return { restored: 0, warnings: [`entry ${entryId} is ${entry.status}, nothing to restore`] };
    }

    const warnings: string[] = [];
    let restoredCount = 0;

    // Restore files
    const filesDir = path.join(entry.storagePath, "files");
    if (entry.originPath && fs.existsSync(filesDir)) {
      try {
        const baseName = path.basename(entry.originPath);
        const src = path.join(filesDir, baseName);
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(entry.originPath), { recursive: true });
          // Unlock + move back
          try { fs.chmodSync(src, 0o644); } catch {}
          fs.renameSync(src, entry.originPath);
          restoredCount++;
        } else {
          warnings.push(`source file missing in FireStorage: ${src}`);
        }
      } catch (err) {
        warnings.push(`file restore failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Restore DB rows
    if (entry.snapshotJson) {
      try {
        const rows = JSON.parse(entry.snapshotJson) as Array<{
          table: string;
          rowId: number | string;
          snapshot: Record<string, unknown>;
        }>;
        const sqlite = (db as any).session?.client || (db as any).$client;
        for (const r of rows) {
          const cols = Object.keys(r.snapshot);
          const placeholders = cols.map(() => "?").join(", ");
          const values = cols.map((c) => {
            const v = r.snapshot[c];
            if (v === null || v === undefined) return null;
            if (typeof v === "object") return JSON.stringify(v);
            if (typeof v === "boolean") return v ? 1 : 0;
            return v;
          });
          try {
            sqlite
              .prepare(
                `INSERT OR REPLACE INTO ${r.table} (${cols.join(", ")}) VALUES (${placeholders})`
              )
              .run(...values);
            restoredCount++;
          } catch (err) {
            warnings.push(`DB row restore failed for ${r.table}:${r.rowId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        warnings.push(`snapshot parse failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    db.update(firestorageEntries)
      .set({ status: "restored", restoredAt: new Date().toISOString() })
      .where(eq(firestorageEntries.id, entryId))
      .run();

    writeAudit({
      action: "restore",
      firestorageEntryId: entryId,
      description: `Restored entry ${entryId} (${entry.originAction})`,
      initiator: "ui",
      result: warnings.length === 0 ? "success" : "failed",
      errorMessage: warnings.length > 0 ? warnings.join("; ") : undefined,
      byteCount: entry.sizeBytes || 0,
    });

    return { restored: restoredCount, warnings };
  },

  /**
   * Hard-purge an entry — physically removes the FireStorage copy. The
   * audit log row stays forever. UI-only path; never call from background
   * code unless `initiator: "expiry_sweeper"` is appropriate.
   */
  purge(entryId: number, initiator: "ui" | "expiry_sweeper" = "ui"): void {
    const entry = db
      .select()
      .from(firestorageEntries)
      .where(eq(firestorageEntries.id, entryId))
      .get() as FirestorageEntry | undefined;
    if (!entry) throw new Error(`FireStorage entry ${entryId} not found`);
    if (entry.status === "purged") return;

    try {
      if (entry.storagePath && fs.existsSync(entry.storagePath)) {
        // Unlock files before rm
        const filesDir = path.join(entry.storagePath, "files");
        if (fs.existsSync(filesDir)) {
          for (const f of fs.readdirSync(filesDir)) {
            try { fs.chmodSync(path.join(filesDir, f), 0o644); } catch {}
          }
        }
        // This is the one place fs.rmSync is allowed — purging from
        // FireStorage itself. Lint exemption: src/lib/delete-service.ts.
        fs.rmSync(entry.storagePath, { recursive: true, force: true });
      }
    } catch (err) {
      writeAudit({
        action: initiator === "ui" ? "purge" : "expiry_purge",
        firestorageEntryId: entryId,
        description: `Purge failed for entry ${entryId}`,
        initiator,
        result: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        byteCount: entry.sizeBytes || 0,
      });
      throw err;
    }

    db.update(firestorageEntries)
      .set({ status: "purged", purgedAt: new Date().toISOString() })
      .where(eq(firestorageEntries.id, entryId))
      .run();

    writeAudit({
      action: initiator === "ui" ? "purge" : "expiry_purge",
      firestorageEntryId: entryId,
      description: `Purged entry ${entryId} (${entry.originAction})`,
      initiator,
      result: "success",
      byteCount: entry.sizeBytes || 0,
    });
  },

  /**
   * Sweep expired entries. Called by a periodic background job. Honors
   * the "pause auto-purge" Settings toggle — when paused, this is a no-op.
   * This is the ONE exception to "no background deletion" — and even here
   * it only purges items past their explicit expires_at, with full audit.
   */
  sweepExpired(): { purged: number; skipped: number } {
    if (isAutoPurgePaused()) {
      return { purged: 0, skipped: -1 }; // -1 sentinel = paused
    }
    const now = new Date().toISOString();
    const expired = db
      .select()
      .from(firestorageEntries)
      .where(
        and(
          eq(firestorageEntries.status, "held"),
          lt(firestorageEntries.expiresAt, now)
        )
      )
      .all() as FirestorageEntry[];

    let purged = 0;
    for (const entry of expired) {
      try {
        this.purge(entry.id, "expiry_sweeper");
        purged++;
      } catch (err) {
        console.error(`[firestorage] sweep purge failed for ${entry.id}:`, err);
      }
    }
    return { purged, skipped: 0 };
  },
};

/**
 * Compatibility helper — many existing call sites just want to feed
 * a single file path into the safe sink. Wraps the full moveToFireStorage.
 */
export async function fireStorageFile(
  filePath: string,
  action: OriginAction,
  description: string,
  metadata?: Record<string, unknown>
): Promise<MoveToFireStorageResult> {
  return deleteService.moveToFireStorage({
    action,
    description,
    files: [filePath],
    metadata: { ...(metadata || {}), bytes: safeFileSize(filePath) },
  });
}
