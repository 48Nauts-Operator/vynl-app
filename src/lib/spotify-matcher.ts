/**
 * Spotify ↔ Local library matching engine.
 * Two strategies:
 *   1. ISRC exact match (highest confidence) — only ~1.6% of beets tracks have ISRCs
 *   2. Fuzzy artist + title match (primary method) — normalizes strings, strips feat/remix tags
 */

import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export interface MatchResult {
  localTrackId: number;
  matchMethod: "isrc" | "fuzzy";
  matchConfidence: number;
}

/** Normalize a string for fuzzy matching */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(feat\.?[^)]*\)/gi, "")    // strip (feat. ...)
    .replace(/\(ft\.?[^)]*\)/gi, "")       // strip (ft. ...)
    .replace(/\(with [^)]*\)/gi, "")       // strip (with ...)
    .replace(/\(remix\)/gi, "")            // strip (remix)
    .replace(/\(remastered[^)]*\)/gi, "")  // strip (remastered ...)
    .replace(/\(deluxe[^)]*\)/gi, "")      // strip (deluxe ...)
    .replace(/\(live[^)]*\)/gi, "")        // strip (live ...)
    .replace(/\(bonus[^)]*\)/gi, "")       // strip (bonus ...)
    .replace(/['']/g, "'")                 // normalize quotes
    .replace(/[""]/g, '"')
    .replace(/[^\w\s'"-]/g, "")            // strip remaining punctuation
    .replace(/\s+/g, " ")                  // collapse whitespace
    .trim();
}

/** Normalize artist name — also handles "Artist1, Artist2" vs "Artist1 & Artist2" */
function normalizeArtist(s: string): string {
  return normalize(s)
    .replace(/\s*[,&]\s*/g, " ")  // "artist1, artist2" → "artist1 artist2"
    .replace(/\s+and\s+/g, " ");  // "artist1 and artist2" → "artist1 artist2"
}

/**
 * Pre-build an in-memory lookup index for fast matching.
 * Call once before matching a batch of Spotify tracks.
 */
export interface TrackIndex {
  byIsrc: Map<string, number>;  // isrc → track.id
  byNormalizedKey: Map<string, number>;  // `${normalizedArtist}|||${normalizedTitle}` → track.id
  allTracks: { id: number; artist: string; title: string; normalizedArtist: string; normalizedTitle: string }[];
}

export function buildTrackIndex(): TrackIndex {
  const allRows = db.select({
    id: tracks.id,
    artist: tracks.artist,
    title: tracks.title,
    isrc: tracks.isrc,
  }).from(tracks).all();

  const byIsrc = new Map<string, number>();
  const byNormalizedKey = new Map<string, number>();
  const allTracks: TrackIndex["allTracks"] = [];

  for (const row of allRows) {
    if (row.isrc) {
      byIsrc.set(row.isrc.toUpperCase(), row.id);
    }

    const nArtist = normalizeArtist(row.artist);
    const nTitle = normalize(row.title);
    const key = `${nArtist}|||${nTitle}`;
    byNormalizedKey.set(key, row.id);

    allTracks.push({
      id: row.id,
      artist: row.artist,
      title: row.title,
      normalizedArtist: nArtist,
      normalizedTitle: nTitle,
    });
  }

  return { byIsrc, byNormalizedKey, allTracks };
}

/**
 * Match a single Spotify track against the local library.
 * Returns null if no match found.
 */
export function matchTrack(
  spotifyArtist: string,
  spotifyTitle: string,
  spotifyIsrc: string | null,
  index: TrackIndex
): MatchResult | null {
  // Strategy 1: ISRC exact match
  if (spotifyIsrc) {
    const id = index.byIsrc.get(spotifyIsrc.toUpperCase());
    if (id) {
      return { localTrackId: id, matchMethod: "isrc", matchConfidence: 1.0 };
    }
  }

  // Strategy 2: Exact normalized artist + title
  const nArtist = normalizeArtist(spotifyArtist);
  const nTitle = normalize(spotifyTitle);
  const key = `${nArtist}|||${nTitle}`;
  const exactId = index.byNormalizedKey.get(key);
  if (exactId) {
    return { localTrackId: exactId, matchMethod: "fuzzy", matchConfidence: 0.95 };
  }

  // Strategy 3: Partial — primary artist matches + title contained
  // Extract first artist from Spotify (before comma/&)
  const primaryArtist = nArtist.split(" ")[0]; // First word of normalized artist
  if (primaryArtist.length >= 3) {
    for (const track of index.allTracks) {
      if (
        track.normalizedArtist.includes(nArtist.split(" ").slice(0, 2).join(" ")) &&
        (track.normalizedTitle === nTitle || track.normalizedTitle.includes(nTitle) || nTitle.includes(track.normalizedTitle))
      ) {
        return { localTrackId: track.id, matchMethod: "fuzzy", matchConfidence: 0.7 };
      }
    }
  }

  return null;
}
