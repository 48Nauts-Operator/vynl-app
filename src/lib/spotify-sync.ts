/**
 * Migration sync — runs Spotify-extract phases 1-5 ONLY:
 *   1. playlists  → 2. playlist_tracks  → 3. liked_songs
 *   → 4. audio_features  → 5. matching
 *
 * Stops there. Phases 6 (mirror to Vynl playlists) and 7 (auto-populate
 * wish_list) are deliberately omitted — the Migration Wizard puts those
 * decisions back in the user's hands.
 *
 * See [[vynl-vision]] memory: Spotify is migration-only. The old
 * `spotify-extract.ts` (full 7-phase auto-mirror) is being replaced by
 * this + the wizard. Keep the old file untouched for now; remove it
 * when the wizard ships.
 */

import { db } from "@/lib/db";
import {
  spotifySnapshots,
  spotifyPlaylists,
  spotifyTracks,
  spotifyPlaylistTracks,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { paginatedFetch, fetchAudioFeatures } from "@/lib/spotify";
import { buildTrackIndex, matchTrack } from "@/lib/spotify-matcher";

// ── Job state (globalThis for HMR persistence) ──────────────────────────

export type SyncPhase =
  | "playlists"
  | "playlist_tracks"
  | "liked_songs"
  | "audio_features"
  | "matching"
  | "complete";

export interface SyncJob {
  snapshotId: number;
  status: "running" | "complete" | "error" | "cancelled";
  phase: SyncPhase;
  phaseDetail: string;
  totalPlaylists: number;
  totalTracks: number;
  totalLikedSongs: number;
  matchedTracks: number;
  unmatchedTracks: number;
  processedTracks: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

const _g = globalThis as typeof globalThis & {
  __vynl_spotifyMigrationSync?: SyncJob | null;
};

function getJob(): SyncJob | null {
  return _g.__vynl_spotifyMigrationSync || null;
}

function setJob(job: SyncJob | null) {
  _g.__vynl_spotifyMigrationSync = job;
}

// ── Public API ──────────────────────────────────────────────────────────

export function getMigrationSyncStatus(): SyncJob | { status: "idle" } {
  const job = getJob();
  if (!job) return { status: "idle" };
  return { ...job };
}

export function cancelMigrationSync(): void {
  const job = getJob();
  if (job && job.status === "running") {
    job.status = "cancelled";
    db.update(spotifySnapshots)
      .set({ status: "cancelled", completedAt: new Date().toISOString() })
      .where(eq(spotifySnapshots.id, job.snapshotId))
      .run();
  }
}

export async function startMigrationSync(): Promise<{ snapshotId: number }> {
  const existing = getJob();
  if (existing && existing.status === "running") {
    throw new Error("Migration sync already running");
  }

  const result = db.insert(spotifySnapshots).values({ status: "running" }).run();
  const snapshotId = Number(result.lastInsertRowid);

  const job: SyncJob = {
    snapshotId,
    status: "running",
    phase: "playlists",
    phaseDetail: "Fetching playlists...",
    totalPlaylists: 0,
    totalTracks: 0,
    totalLikedSongs: 0,
    matchedTracks: 0,
    unmatchedTracks: 0,
    processedTracks: 0,
    startedAt: new Date().toISOString(),
  };
  setJob(job);

  // Fire-and-forget — UI polls via getMigrationSyncStatus.
  runSync(job).catch((err) => {
    console.error("[spotify-sync] error:", err);
    job.status = "error";
    job.error = String(err);
    db.update(spotifySnapshots)
      .set({ status: "error", completedAt: new Date().toISOString() })
      .where(eq(spotifySnapshots.id, snapshotId))
      .run();
  });

  return { snapshotId };
}

// ── Pipeline (phases 1-5 only) ───────────────────────────────────────────

interface SpotifyPlaylistItem {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: { total: number };
}

interface SpotifyPlaylistTrackItem {
  track: {
    id: string;
    uri: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
    duration_ms: number;
    preview_url: string | null;
    external_ids?: { isrc?: string };
    popularity?: number;
  } | null;
  is_local: boolean;
}

interface SpotifyLikedItem {
  track: {
    id: string;
    uri: string;
    name: string;
    artists: { name: string }[];
    album: { name: string; images: { url: string }[] };
    duration_ms: number;
    preview_url: string | null;
    external_ids?: { isrc?: string };
    popularity?: number;
  };
}

async function runSync(job: SyncJob) {
  const { snapshotId } = job;
  const spotifyIdToDbId = new Map<string, number>();
  const playlistDbIds: number[] = [];

  // ── Phase 1: Playlists ──
  job.phase = "playlists";
  job.phaseDetail = "Fetching playlists...";

  const playlistItems: SpotifyPlaylistItem[] = [];
  for await (const pl of paginatedFetch<SpotifyPlaylistItem>("/me/playlists?limit=50")) {
    if ((job.status as string) === "cancelled") return;
    playlistItems.push(pl);
    job.totalPlaylists = playlistItems.length;
    job.phaseDetail = `Fetching playlists... (${playlistItems.length})`;
  }

  for (const pl of playlistItems) {
    const res = db.insert(spotifyPlaylists).values({
      snapshotId,
      spotifyId: pl.id,
      name: pl.name,
      description: pl.description || null,
      imageUrl: pl.images?.[0]?.url || null,
      trackCount: pl.tracks?.total || 0,
    }).run();
    playlistDbIds.push(Number(res.lastInsertRowid));
  }

  // ── Phase 2: Playlist tracks ──
  job.phase = "playlist_tracks";

  for (let pi = 0; pi < playlistItems.length; pi++) {
    if ((job.status as string) === "cancelled") return;
    const pl = playlistItems[pi];
    job.phaseDetail = `Playlist ${pi + 1}/${playlistItems.length}: ${pl.name}`;

    let position = 0;
    for await (const item of paginatedFetch<SpotifyPlaylistTrackItem>(
      `/playlists/${pl.id}/tracks?limit=100&fields=items(track(id,uri,name,artists,album,duration_ms,preview_url,external_ids,popularity),is_local),next`
    )) {
      if ((job.status as string) === "cancelled") return;
      if (!item.track || item.is_local || !item.track.id) {
        position++;
        continue;
      }
      const t = item.track;
      let dbId = spotifyIdToDbId.get(t.id);
      if (!dbId) {
        const res = db.insert(spotifyTracks).values({
          snapshotId,
          spotifyId: t.id,
          spotifyUri: t.uri,
          title: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
          album: t.album?.name || null,
          isrc: t.external_ids?.isrc || null,
          durationMs: t.duration_ms,
          coverUrl: t.album?.images?.[0]?.url || null,
          previewUrl: t.preview_url || null,
          popularity: t.popularity ?? null,
        }).run();
        dbId = Number(res.lastInsertRowid);
        spotifyIdToDbId.set(t.id, dbId);
        job.totalTracks++;
      }
      db.insert(spotifyPlaylistTracks).values({
        spotifyPlaylistId: playlistDbIds[pi],
        spotifyTrackId: dbId,
        position,
      }).run();
      position++;
      job.processedTracks = spotifyIdToDbId.size;
    }
  }

  // ── Phase 3: Liked songs ──
  job.phase = "liked_songs";
  job.phaseDetail = "Fetching liked songs...";

  let likedCount = 0;
  for await (const item of paginatedFetch<SpotifyLikedItem>("/me/tracks?limit=50")) {
    if ((job.status as string) === "cancelled") return;
    const t = item.track;
    if (!t || !t.id) continue;

    let dbId = spotifyIdToDbId.get(t.id);
    if (!dbId) {
      const res = db.insert(spotifyTracks).values({
        snapshotId,
        spotifyId: t.id,
        spotifyUri: t.uri,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album: t.album?.name || null,
        isrc: t.external_ids?.isrc || null,
        durationMs: t.duration_ms,
        coverUrl: t.album?.images?.[0]?.url || null,
        previewUrl: t.preview_url || null,
        popularity: t.popularity ?? null,
        isLikedSong: true,
      }).run();
      dbId = Number(res.lastInsertRowid);
      spotifyIdToDbId.set(t.id, dbId);
      job.totalTracks++;
    } else {
      db.update(spotifyTracks)
        .set({ isLikedSong: true })
        .where(eq(spotifyTracks.id, dbId))
        .run();
    }
    likedCount++;
    job.totalLikedSongs = likedCount;
    job.phaseDetail = `Fetching liked songs... (${likedCount})`;
    job.processedTracks = spotifyIdToDbId.size;
  }

  // ── Phase 4: Audio features ──
  job.phase = "audio_features";
  job.phaseDetail = "Fetching audio features...";

  const allSpotifyIds = Array.from(spotifyIdToDbId.keys());
  const features = await fetchAudioFeatures(allSpotifyIds);

  for (const [spotifyId, af] of features) {
    const dbId = spotifyIdToDbId.get(spotifyId);
    if (dbId) {
      db.update(spotifyTracks)
        .set({
          bpm: af.tempo,
          energy: af.energy,
          danceability: af.danceability,
          valence: af.valence,
          audioKey: af.key,
          audioMode: af.mode,
        })
        .where(eq(spotifyTracks.id, dbId))
        .run();
    }
  }
  job.phaseDetail = `Audio features: ${features.size}/${allSpotifyIds.length}`;

  // ── Phase 5: Match against local library ──
  job.phase = "matching";
  job.phaseDetail = "Building track index...";

  const index = buildTrackIndex();

  const allSpotifyTracksRows = db.select().from(spotifyTracks)
    .where(eq(spotifyTracks.snapshotId, snapshotId))
    .all();

  let matched = 0;
  let unmatched = 0;
  for (let i = 0; i < allSpotifyTracksRows.length; i++) {
    if ((job.status as string) === "cancelled") return;
    const st = allSpotifyTracksRows[i];
    const result = matchTrack(st.artist, st.title, st.isrc || null, index);
    if (result) {
      db.update(spotifyTracks)
        .set({
          localTrackId: result.localTrackId,
          matchMethod: result.matchMethod,
          matchConfidence: result.matchConfidence,
        })
        .where(eq(spotifyTracks.id, st.id))
        .run();
      matched++;
    } else {
      unmatched++;
    }
    job.matchedTracks = matched;
    job.unmatchedTracks = unmatched;
    if (i % 100 === 0) {
      job.phaseDetail = `Matching... ${i + 1}/${allSpotifyTracksRows.length} (${matched} matched)`;
    }
  }

  // ── Complete (no mirror, no auto-wishlist) ──
  job.phase = "complete";
  job.phaseDetail = `Done — ${matched} matched, ${unmatched} missing`;
  job.status = "complete";
  job.completedAt = new Date().toISOString();

  db.update(spotifySnapshots)
    .set({
      status: "complete",
      totalPlaylists: job.totalPlaylists,
      totalTracks: job.totalTracks,
      totalLikedSongs: job.totalLikedSongs,
      matchedTracks: matched,
      unmatchedTracks: unmatched,
      completedAt: new Date().toISOString(),
    })
    .where(eq(spotifySnapshots.id, snapshotId))
    .run();
}
