/**
 * PATCH /api/tracks/[id]/metadata
 *
 * Partial-update a single track's user-editable metadata (title, artist,
 * album, albumArtist, genre, year). Gated on the manual_edit_enabled
 * setting — 403 if disabled.
 *
 * For each field that actually differs from the current value:
 *   1. INSERT into metadata_edits (audit log)
 *   2. Append the field name to tracks.user_overridden_fields (sticky
 *      so beets sync won't overwrite it)
 * Then apply the UPDATE.
 *
 * Body: { title?, artist?, album?, albumArtist?, genre?, year? }
 * Returns: { updated: 1 | 0, edits: <count>, batchId | null }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks, metadataEdits } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSetting } from "@/lib/app-settings";
import { randomBytes } from "crypto";

const EDITABLE_FIELDS = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "genre",
  "year",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

// Maps the Drizzle camelCase key → DB snake_case column for the JSON
// stored in tracks.user_overridden_fields.
const FIELD_DB_NAME: Record<EditableField, string> = {
  title: "title",
  artist: "artist",
  album: "album",
  albumArtist: "album_artist",
  genre: "genre",
  year: "year",
};

function isManualEditEnabled(): boolean {
  return getSetting("manual_edit_enabled") === "1";
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isManualEditEnabled()) {
    return NextResponse.json(
      { error: "Manual editing is disabled. Enable it in Settings → Library editing." },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const trackId = parseInt(id, 10);
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: "Invalid track id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<
    Record<EditableField, string | number | null>
  >;

  // Filter to known fields only — silently ignore anything else
  const incoming: Partial<Record<EditableField, string | number | null>> = {};
  for (const f of EDITABLE_FIELDS) {
    if (f in body) incoming[f] = body[f];
  }
  if (Object.keys(incoming).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  // Validation
  const currentYear = new Date().getFullYear();
  for (const [k, v] of Object.entries(incoming)) {
    if (k === "year") {
      if (v !== null && v !== undefined && v !== "") {
        const n = typeof v === "number" ? v : parseInt(String(v), 10);
        if (!Number.isFinite(n) || n < 1000 || n > currentYear + 1) {
          return NextResponse.json(
            { error: `year must be between 1000 and ${currentYear + 1}` },
            { status: 400 }
          );
        }
        incoming.year = n;
      } else {
        incoming.year = null;
      }
    } else if (k === "title" || k === "artist" || k === "album") {
      // Non-empty trimmed
      if (typeof v !== "string" || v.trim().length === 0) {
        return NextResponse.json(
          { error: `${k} must be a non-empty string` },
          { status: 400 }
        );
      }
      incoming[k as EditableField] = v.trim();
    } else if (typeof v === "string") {
      // genre, albumArtist — allow empty (null on save)
      const trimmed = v.trim();
      incoming[k as EditableField] = trimmed === "" ? null : trimmed;
    }
  }

  // Load current row to diff against
  const current = db
    .select()
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .get();
  if (!current) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // Identify the changed fields by comparing trimmed values
  const changedFields: EditableField[] = [];
  for (const f of EDITABLE_FIELDS) {
    if (!(f in incoming)) continue;
    const newVal = incoming[f] ?? null;
    const oldVal = (current as Record<string, unknown>)[f] ?? null;
    // Equality treats null/undefined as same
    if (String(newVal ?? "") !== String(oldVal ?? "")) {
      changedFields.push(f);
    }
  }

  if (changedFields.length === 0) {
    return NextResponse.json({ updated: 0, edits: 0, batchId: null });
  }

  const batchId = randomBytes(6).toString("hex");

  // Insert audit rows BEFORE the UPDATE so a crash mid-write still
  // leaves a record of intent.
  for (const f of changedFields) {
    db.insert(metadataEdits)
      .values({
        trackId,
        fieldName: FIELD_DB_NAME[f],
        oldValue:
          (current as Record<string, unknown>)[f] != null
            ? String((current as Record<string, unknown>)[f])
            : null,
        newValue: incoming[f] != null ? String(incoming[f]) : null,
        editBatchId: batchId,
      })
      .run();
  }

  // Merge new override fields into the existing JSON array
  const existingOverrides: string[] = (() => {
    try {
      const parsed = JSON.parse(current.userOverriddenFields || "[]");
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  })();
  const mergedOverrides = Array.from(
    new Set([...existingOverrides, ...changedFields.map((f) => FIELD_DB_NAME[f])])
  );

  // Apply the UPDATE — use raw set object so Drizzle handles each column
  const updateSet: Record<string, unknown> = {
    userOverriddenFields: JSON.stringify(mergedOverrides),
  };
  for (const f of changedFields) {
    updateSet[f] = incoming[f];
  }

  db.update(tracks).set(updateSet).where(eq(tracks.id, trackId)).run();

  return NextResponse.json({
    updated: 1,
    edits: changedFields.length,
    batchId,
    fields: changedFields,
  });
}
