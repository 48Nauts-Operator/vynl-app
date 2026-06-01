/**
 * GET /api/tracks/[id]/edit-history
 *
 * Returns the last 50 metadata edits for a track, newest first. Used by
 * the EditHistoryPopover component. No auth gate — reading history is
 * non-destructive.
 *
 * Returns: { trackId, edits: [{ id, fieldName, oldValue, newValue,
 *           editBatchId, editedAt }, ...] }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { metadataEdits } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const trackId = parseInt(id, 10);
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: "Invalid track id" }, { status: 400 });
  }

  const rows = db
    .select()
    .from(metadataEdits)
    .where(eq(metadataEdits.trackId, trackId))
    .orderBy(desc(metadataEdits.editedAt))
    .limit(50)
    .all();

  return NextResponse.json({ trackId, edits: rows });
}
