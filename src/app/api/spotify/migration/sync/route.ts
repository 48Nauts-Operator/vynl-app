import { NextResponse } from "next/server";
import {
  startMigrationSync,
  getMigrationSyncStatus,
  cancelMigrationSync,
} from "@/lib/spotify-sync";

/**
 * Spotify Migration Wizard — sync trigger.
 * Runs the safe phases 1-5 (fetch + match). Does NOT mirror playlists
 * or auto-populate the wishlist — those are user-driven from the wizard.
 *
 * POST   → start (returns { snapshotId })
 * GET    → poll status (matches the old extract status shape so a future
 *          shared poller can read both)
 * DELETE → cancel the running job
 */

export async function POST() {
  try {
    const result = await startMigrationSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 409 }
    );
  }
}

export async function GET() {
  return NextResponse.json(getMigrationSyncStatus());
}

export async function DELETE() {
  cancelMigrationSync();
  return NextResponse.json({ cancelled: true });
}
