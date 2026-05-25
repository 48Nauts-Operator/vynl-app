import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spotifyAuth, spotifySnapshots, wishList } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/spotify
 *
 * "Disconnect & Wipe" — the terminal action of the Migration Wizard
 * flow. Removes ALL Spotify state from Vynl:
 *
 *   - spotify_auth   → OAuth tokens (re-auth required to reconnect)
 *   - spotify_snapshots → cascade-deletes spotify_playlists, spotify_tracks,
 *                         spotify_playlist_tracks (FK ON DELETE CASCADE)
 *   - wish_list WHERE type='spotify_missing' → the wishlist rows the user
 *     created from this Spotify session. Other wishlist types stay.
 *
 * Per [[vynl-vision]] memory: Spotify is a one-shot migration tunnel.
 * After this runs, Vynl has no remaining Spotify dependency.
 *
 * Returns { wiped: true, counts: { auth, snapshots, wishlistMissing } }.
 */
export async function DELETE() {
  const counts = {
    auth: db.select({ id: spotifyAuth.id }).from(spotifyAuth).all().length,
    snapshots: db.select({ id: spotifySnapshots.id }).from(spotifySnapshots).all().length,
    wishlistMissing: db
      .select({ id: wishList.id })
      .from(wishList)
      .where(eq(wishList.type, "spotify_missing"))
      .all().length,
  };

  db.delete(wishList).where(eq(wishList.type, "spotify_missing")).run();
  db.delete(spotifySnapshots).run(); // cascade → playlists, tracks, playlist_tracks
  db.delete(spotifyAuth).run();

  return NextResponse.json({ wiped: true, counts });
}
