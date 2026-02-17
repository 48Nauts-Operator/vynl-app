/**
 * Spotify data extraction background job.
 * 7 phases: playlists → playlist tracks → liked songs → audio features → match → mirror playlists → wishlist
 *
 * Uses globalThis to persist state across Next.js HMR reloads.
 */

import { db } from "@/lib/db";
import {
  spotifySnapshots, spotifyPlaylists, spotifyTracks,
  spotifyPlaylistTracks, playlists, playlistTracks,
  wishList, tracks,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { paginatedFetch, fetchAudioFeatures } from "@/lib/spotify";
import { buildTrackIndex, matchTrack } from "@/lib/spotify-matcher";

// ── globalThis state for HMR persistence ──

interface ExtractJob {
  snapshotId: number;
  status: string; // "running" | "complete" | "error" | "cancelled"
  phase: string;
  phaseDetail: string;
  totalPlaylists: number;
  totalTracks: number;
  totalLikedSongs: number;
  matchedTracks: number;
  unmatchedTracks: number;
  processedTracks: number;
  startedAt: string;
  error?: string;
}

const _g = globalThis as typeof globalThis & {
  __vynl_spotifyExtract?: ExtractJob | null;
};

function getJob(): ExtractJob | null {
  return _g.__vynl_spotifyExtract || null;
}

function setJob(job: ExtractJob | null) {
  _g.__vynl_spotifyExtract = job;
}

// ── Public API ──

export function getExtractStatus() {
  const job = getJob();
  if (!job) return { status: "idle" };
  return { ...job };
}

export function cancelExtract() {
  const job = getJob();
  if (job && job.status === "running") {
    job.status = "cancelled";
    db.update(spotifySnapshots)
      .set({ status: "cancelled", completedAt: new Date().toISOString() })
      .where(eq(spotifySnapshots.id, job.snapshotId))
      .run();
  }
}

export async function startExtract() {
  const existing = getJob();
  if (existing && existing.status === "running") {
    throw new Error("Extraction already running");
  }

  // Create snapshot record
  const result = db.insert(spotifySnapshots).values({
    status: "running",
  }).run();
  const snapshotId = Number(result.lastInsertRowid);

  const job: ExtractJob = {
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

  // Run extraction in background (don't await)
  runExtraction(job).catch((err) => {
    console.error("Spotify extraction error:", err);
    job.status = "error";
    job.error = String(err);
    db.update(spotifySnapshots)
      .set({ status: "error", completedAt: new Date().toISOString() })
      .where(eq(spotifySnapshots.id, snapshotId))
      .run();
  });

  return { snapshotId };
}

// ── Extraction pipeline ──

async function runExtraction(job: ExtractJob) {
  const { snapshotId } = job;

  // Track spotify ID → our DB row ID for dedup
  const spotifyIdToDbId = new Map<string, number>();
  // Track spotify playlist DB IDs for phase 6
  const playlistDbIds: number[] = [];

  // ── Phase 1: Fetch playlists ──
  job.phase = "playlists";
  job.phaseDetail = "Fetching playlists...";

  interface SpotifyPlaylistItem {
    id: string;
    name: string;
    description: string;
    images: { url: string }[];
    tracks: { total: number };
  }

  const playlistItems: SpotifyPlaylistItem[] = [];
  for await (const pl of paginatedFetch<SpotifyPlaylistItem>("/me/playlists?limit=50")) {
    if (job.status === "cancelled") return;
    playlistItems.push(pl);
    job.totalPlaylists = playlistItems.length;
    job.phaseDetail = `Fetching playlists... (${playlistItems.length})`;
  }

  // Insert playlists into DB
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

  // ── Phase 2: Fetch playlist tracks ──
  job.phase = "playlist_tracks";

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

  for (let pi = 0; pi < playlistItems.length; pi++) {
    if (job.status === "cancelled") return;
    const pl = playlistItems[pi];
    job.phaseDetail = `Playlist ${pi + 1}/${playlistItems.length}: ${pl.name}`;

    let position = 0;
    for await (const item of paginatedFetch<SpotifyPlaylistTrackItem>(
      `/playlists/${pl.id}/tracks?limit=100&fields=items(track(id,uri,name,artists,album,duration_ms,preview_url,external_ids,popularity),is_local),next`
    )) {
      if (job.status === "cancelled") return;
      if (!item.track || item.is_local || !item.track.id) {
        position++;
        continue;
      }

      const t = item.track;
      let dbId = spotifyIdToDbId.get(t.id);

      if (!dbId) {
        // Insert new spotify track
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

      // Link to playlist
      db.insert(spotifyPlaylistTracks).values({
        spotifyPlaylistId: playlistDbIds[pi],
        spotifyTrackId: dbId,
        position,
      }).run();

      position++;
      job.processedTracks = spotifyIdToDbId.size;
    }
  }

  // ── Phase 3: Fetch liked songs ──
  job.phase = "liked_songs";
  job.phaseDetail = "Fetching liked songs...";

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

  let likedCount = 0;
  for await (const item of paginatedFetch<SpotifyLikedItem>("/me/tracks?limit=50")) {
    if (job.status === "cancelled") return;
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
      // Mark existing track as liked
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

  // ── Phase 4: Fetch audio features ──
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

  const allSpotifyTracks = db.select().from(spotifyTracks)
    .where(eq(spotifyTracks.snapshotId, snapshotId))
    .all();

  let matched = 0;
  let unmatched = 0;
  for (let i = 0; i < allSpotifyTracks.length; i++) {
    if (job.status === "cancelled") return;
    const st = allSpotifyTracks[i];

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
      job.phaseDetail = `Matching tracks... ${i + 1}/${allSpotifyTracks.length} (${matched} matched)`;
    }
  }

  // ── Phase 6: Mirror matched playlists as Vynl playlists ──
  job.phase = "mirroring";
  job.phaseDetail = "Creating Vynl playlists...";

  const spPlaylists = db.select().from(spotifyPlaylists)
    .where(eq(spotifyPlaylists.snapshotId, snapshotId))
    .all();

  for (const spPl of spPlaylists) {
    if (job.status === "cancelled") return;

    // Get matched tracks for this playlist
    const playlistTrackRows = db.select({
      spotifyTrackId: spotifyPlaylistTracks.spotifyTrackId,
      position: spotifyPlaylistTracks.position,
      localTrackId: spotifyTracks.localTrackId,
    })
      .from(spotifyPlaylistTracks)
      .innerJoin(spotifyTracks, eq(spotifyPlaylistTracks.spotifyTrackId, spotifyTracks.id))
      .where(eq(spotifyPlaylistTracks.spotifyPlaylistId, spPl.id))
      .all();

    const matchedRows = playlistTrackRows.filter((r) => r.localTrackId !== null);

    // Only mirror if at least 1 matched track
    if (matchedRows.length === 0) continue;

    // Create Vynl playlist
    const plResult = db.insert(playlists).values({
      name: `${spPl.name} (Spotify)`,
      description: `Mirrored from Spotify. ${matchedRows.length}/${playlistTrackRows.length} tracks matched.`,
      isAutoGenerated: true,
    }).run();
    const vynlPlaylistId = Number(plResult.lastInsertRowid);

    // Insert matched tracks
    for (let i = 0; i < matchedRows.length; i++) {
      db.insert(playlistTracks).values({
        playlistId: vynlPlaylistId,
        trackId: matchedRows[i].localTrackId!,
        position: i,
      }).run();
    }

    // Link back
    db.update(spotifyPlaylists)
      .set({ vynlPlaylistId })
      .where(eq(spotifyPlaylists.id, spPl.id))
      .run();

    job.phaseDetail = `Created playlist: ${spPl.name} (${matchedRows.length} tracks)`;
  }

  // ── Phase 7: Populate wishlist with unmatched tracks ──
  job.phase = "wishlist";
  job.phaseDetail = "Clearing old wishlist items...";

  // Remove old spotify_missing items so re-extraction doesn't duplicate
  db.delete(wishList).where(eq(wishList.type, "spotify_missing")).run();

  job.phaseDetail = "Populating wishlist...";

  const unmatchedRows = db.select().from(spotifyTracks)
    .where(
      sql`${spotifyTracks.snapshotId} = ${snapshotId} AND ${spotifyTracks.localTrackId} IS NULL`
    )
    .all();

  // For each unmatched track, find which playlists it belongs to
  for (const ut of unmatchedRows) {
    if (job.status === "cancelled") return;

    const plLinks = db.select({ name: spotifyPlaylists.name })
      .from(spotifyPlaylistTracks)
      .innerJoin(spotifyPlaylists, eq(spotifyPlaylistTracks.spotifyPlaylistId, spotifyPlaylists.id))
      .where(eq(spotifyPlaylistTracks.spotifyTrackId, ut.id))
      .all();

    const playlistNames = plLinks.map((pl) => pl.name);

    db.insert(wishList).values({
      type: "spotify_missing",
      seedTitle: ut.title,
      seedArtist: ut.artist,
      seedAlbum: ut.album,
      spotifyTrackId: ut.id,
      spotifyUri: ut.spotifyUri,
      isrc: ut.isrc,
      coverUrl: ut.coverUrl,
      spotifyPlaylistNames: JSON.stringify(playlistNames),
      popularity: ut.popularity,
      status: "pending",
    }).run();
  }

  // ── Complete ──
  job.phase = "complete";
  job.phaseDetail = `Done! ${matched} matched, ${unmatched} unmatched`;
  job.status = "complete";

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
