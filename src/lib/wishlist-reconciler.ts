/**
 * Wishlist Reconciler
 *
 * Matches pending/downloading wishlist items against the local library
 * using ISRC exact match + fuzzy artist/title matching.
 * Marks matched items as "completed".
 */

import { db } from "@/lib/db";
import { wishList } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { buildTrackIndex, matchTrack } from "@/lib/spotify-matcher";

export interface ReconcileResult {
  totalItems: number;
  matched: number;
  itemsUpdated: Array<{
    id: number;
    title: string;
    artist: string;
    matchMethod: "isrc" | "fuzzy";
    confidence: number;
  }>;
}

export function reconcileWishlist(): ReconcileResult {
  // Load pending/downloading wishlist items
  const sqlite = (db as any).session?.client || (db as any).$client;
  const pendingItems = sqlite
    .prepare(
      `SELECT id, seed_title, seed_artist, seed_album, isrc
       FROM wish_list
       WHERE status IN ('pending', 'downloading')`
    )
    .all() as Array<{
    id: number;
    seed_title: string | null;
    seed_artist: string | null;
    seed_album: string | null;
    isrc: string | null;
  }>;

  if (pendingItems.length === 0) {
    return { totalItems: 0, matched: 0, itemsUpdated: [] };
  }

  // Build track index once for all matching
  const index = buildTrackIndex();

  const itemsUpdated: ReconcileResult["itemsUpdated"] = [];
  const idsToComplete: number[] = [];

  for (const item of pendingItems) {
    if (!item.seed_title || !item.seed_artist) continue;

    const match = matchTrack(
      item.seed_artist,
      item.seed_title,
      item.isrc,
      index
    );

    if (match) {
      idsToComplete.push(item.id);
      itemsUpdated.push({
        id: item.id,
        title: item.seed_title,
        artist: item.seed_artist,
        matchMethod: match.matchMethod,
        confidence: match.matchConfidence,
      });
    }
  }

  // Batch update matched items to completed
  if (idsToComplete.length > 0) {
    db.update(wishList)
      .set({ status: "completed" })
      .where(inArray(wishList.id, idsToComplete))
      .run();
  }

  return {
    totalItems: pendingItems.length,
    matched: itemsUpdated.length,
    itemsUpdated,
  };
}
