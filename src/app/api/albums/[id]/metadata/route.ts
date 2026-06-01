/**
 * PATCH /api/albums/[id]/metadata
 *
 * Album-scope metadata edit. Updates album / albumArtist / genre / year
 * across EVERY track in the album. Album id format: <albumArtist>---<album>
 * (URL-encoded), same as /api/albums/[id]/route.ts.
 *
 * Gated on manual_edit_enabled — 403 if disabled.
 *
 * For each track that differs on any field, INSERT one row per changed
 * field into metadata_edits (sharing a single batchId so the UI can
 * group them). Append the changed-field names to that track's
 * user_overridden_fields so beets sync respects the override.
 *
 * Body: { album?, albumArtist?, genre?, year? }
 * Returns: { updated, edits, batchId, affectedTracks }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks, metadataEdits } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSetting } from "@/lib/app-settings";
import { randomBytes } from "crypto";

const ALBUM_FIELDS = ["album", "albumArtist", "genre", "year"] as const;
type AlbumField = (typeof ALBUM_FIELDS)[number];

const FIELD_DB_NAME: Record<AlbumField, string> = {
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
  const [albumArtistKey, albumKey] = decodeURIComponent(id).split("---");
  if (!albumKey) {
    return NextResponse.json(
      { error: "Invalid album id. Expected albumArtist---album" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Partial<
    Record<AlbumField, string | number | null>
  >;

  // Filter + validate
  const incoming: Partial<Record<AlbumField, string | number | null>> = {};
  const currentYear = new Date().getFullYear();
  for (const f of ALBUM_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    if (f === "year") {
      if (v === null || v === "" || v === undefined) {
        incoming.year = null;
      } else {
        const n = typeof v === "number" ? v : parseInt(String(v), 10);
        if (!Number.isFinite(n) || n < 1000 || n > currentYear + 1) {
          return NextResponse.json(
            { error: `year must be between 1000 and ${currentYear + 1}` },
            { status: 400 }
          );
        }
        incoming.year = n;
      }
    } else if (f === "album") {
      if (typeof v !== "string" || v.trim().length === 0) {
        return NextResponse.json(
          { error: "album must be a non-empty string" },
          { status: 400 }
        );
      }
      incoming.album = v.trim();
    } else {
      // albumArtist, genre — allow empty (null on save)
      if (typeof v === "string") {
        const trimmed = v.trim();
        incoming[f] = trimmed === "" ? null : trimmed;
      } else {
        incoming[f] = null;
      }
    }
  }

  if (Object.keys(incoming).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  // Load ALL tracks in this album using the same WHERE pattern as
  // /api/albums/rename/route.ts — albumArtist OR artist match.
  const sqlite = (db as any).session?.client || (db as any).$client;
  const albumTracks = sqlite
    .prepare(
      `SELECT id, title, artist, album, album_artist, genre, year, user_overridden_fields
       FROM tracks
       WHERE (album_artist = ? OR artist = ?) AND album = ?`
    )
    .all(albumArtistKey, albumArtistKey, albumKey) as Array<{
      id: number;
      title: string;
      artist: string;
      album: string;
      album_artist: string | null;
      genre: string | null;
      year: number | null;
      user_overridden_fields: string | null;
    }>;

  if (albumTracks.length === 0) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  const batchId = randomBytes(6).toString("hex");
  let totalEdits = 0;
  let affectedTracks = 0;

  // Per-track diff + audit + override-merge. We do this in a loop because
  // existing user_overridden_fields differs per track, so the UPDATE
  // can't be a single bulk statement.
  for (const t of albumTracks) {
    const currentMap = {
      album: t.album,
      albumArtist: t.album_artist,
      genre: t.genre,
      year: t.year,
    };

    const changedFields: AlbumField[] = [];
    for (const f of ALBUM_FIELDS) {
      if (!(f in incoming)) continue;
      const oldVal = currentMap[f];
      const newVal = incoming[f] ?? null;
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        changedFields.push(f);
      }
    }
    if (changedFields.length === 0) continue;

    affectedTracks++;
    for (const f of changedFields) {
      db.insert(metadataEdits)
        .values({
          trackId: t.id,
          fieldName: FIELD_DB_NAME[f],
          oldValue: currentMap[f] != null ? String(currentMap[f]) : null,
          newValue: incoming[f] != null ? String(incoming[f]) : null,
          editBatchId: batchId,
        })
        .run();
      totalEdits++;
    }

    // Merge per-track overrides
    let existing: string[] = [];
    try {
      const parsed = JSON.parse(t.user_overridden_fields || "[]");
      if (Array.isArray(parsed)) existing = parsed.filter((s) => typeof s === "string");
    } catch { /* ignore malformed JSON */ }
    const merged = Array.from(
      new Set([...existing, ...changedFields.map((f) => FIELD_DB_NAME[f])])
    );

    const updateSet: Record<string, unknown> = {
      userOverriddenFields: JSON.stringify(merged),
    };
    for (const f of changedFields) updateSet[f] = incoming[f];

    db.update(tracks).set(updateSet).where(eq(tracks.id, t.id)).run();
  }

  return NextResponse.json({
    updated: affectedTracks,
    edits: totalEdits,
    batchId: totalEdits > 0 ? batchId : null,
    affectedTracks,
    totalTracks: albumTracks.length,
  });
}
