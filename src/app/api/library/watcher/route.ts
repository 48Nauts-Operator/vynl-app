import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { watcherConfig } from "@/lib/db/schema";
import {
  startWatcher,
  stopWatcher,
  getWatcherStatus,
} from "@/lib/file-watcher";

/** GET — watcher status */
export async function GET() {
  try {
    const status = getWatcherStatus();

    // Also load persisted config from DB
    const sqlite = (db as any).session?.client || (db as any).$client;
    let dbConfig = null;
    try {
      dbConfig = sqlite
        .prepare("SELECT * FROM watcher_config WHERE id = 1")
        .get() as {
        enabled: number;
        watch_paths: string;
        debounce_seconds: number;
        auto_delete_on_success: number;
      } | undefined;
    } catch {}

    return NextResponse.json({
      ...status,
      dbConfig: dbConfig
        ? {
            enabled: !!dbConfig.enabled,
            watchPaths: JSON.parse(dbConfig.watch_paths || "[]"),
            debounceSeconds: dbConfig.debounce_seconds,
            autoDeleteOnSuccess: !!dbConfig.auto_delete_on_success,
          }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get status", details: String(err) },
      { status: 500 }
    );
  }
}

/** POST — start watcher */
export async function POST() {
  try {
    // Load config from DB
    const sqlite = (db as any).session?.client || (db as any).$client;
    const dbConfig = sqlite
      .prepare("SELECT * FROM watcher_config WHERE id = 1")
      .get() as {
      enabled: number;
      watch_paths: string;
      debounce_seconds: number;
      auto_delete_on_success: number;
    } | undefined;

    if (!dbConfig) {
      return NextResponse.json(
        { error: "No watcher configuration saved. Use PUT to save config first." },
        { status: 400 }
      );
    }

    const watchPaths: string[] = JSON.parse(dbConfig.watch_paths || "[]");
    if (watchPaths.length === 0) {
      return NextResponse.json(
        { error: "No watch paths configured" },
        { status: 400 }
      );
    }

    const result = startWatcher({
      watchPaths,
      debounceSeconds: dbConfig.debounce_seconds,
      autoDeleteOnSuccess: !!dbConfig.auto_delete_on_success,
    });

    if (result.success) {
      // Mark as enabled in DB
      sqlite
        .prepare(
          `INSERT INTO watcher_config (id, enabled, watch_paths, debounce_seconds, auto_delete_on_success, updated_at)
           VALUES (1, 1, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET enabled = 1, updated_at = datetime('now')`
        )
        .run(
          dbConfig.watch_paths,
          dbConfig.debounce_seconds,
          dbConfig.auto_delete_on_success
        );
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to start watcher", details: String(err) },
      { status: 500 }
    );
  }
}

/** DELETE — stop watcher */
export async function DELETE() {
  try {
    const result = stopWatcher();

    // Mark as disabled in DB
    const sqlite = (db as any).session?.client || (db as any).$client;
    try {
      sqlite
        .prepare(
          `UPDATE watcher_config SET enabled = 0, updated_at = datetime('now') WHERE id = 1`
        )
        .run();
    } catch {}

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to stop watcher", details: String(err) },
      { status: 500 }
    );
  }
}

/** PUT — save config */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      watchPaths = [],
      debounceSeconds = 10,
      autoDeleteOnSuccess = true,
    } = body;

    if (!Array.isArray(watchPaths)) {
      return NextResponse.json(
        { error: "watchPaths must be an array" },
        { status: 400 }
      );
    }

    const sqlite = (db as any).session?.client || (db as any).$client;
    sqlite
      .prepare(
        `INSERT INTO watcher_config (id, enabled, watch_paths, debounce_seconds, auto_delete_on_success, updated_at)
         VALUES (1, 0, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           watch_paths = excluded.watch_paths,
           debounce_seconds = excluded.debounce_seconds,
           auto_delete_on_success = excluded.auto_delete_on_success,
           updated_at = datetime('now')`
      )
      .run(
        JSON.stringify(watchPaths),
        debounceSeconds,
        autoDeleteOnSuccess ? 1 : 0
      );

    return NextResponse.json({ saved: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save config", details: String(err) },
      { status: 500 }
    );
  }
}
