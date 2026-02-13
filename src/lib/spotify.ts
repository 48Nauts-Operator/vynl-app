/**
 * Spotify OAuth + API client.
 * Uses Authorization Code flow (not PKCE) since we have client_secret server-side.
 * Tokens are stored in the sqlite spotify_auth table and auto-refreshed.
 */

import { db } from "@/lib/db";
import { spotifyAuth } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const SCOPES = [
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-private",
  "user-read-email",
].join(" ");

function getClientId(): string {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("SPOTIFY_CLIENT_ID not set");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error("SPOTIFY_CLIENT_SECRET not set");
  return secret;
}

function getRedirectUri(): string {
  return process.env.SPOTIFY_REDIRECT_URI || `http://localhost:3101/api/spotify/callback`;
}

/** Build the Spotify authorize URL for the OAuth redirect */
export function getAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    scope: SCOPES,
    redirect_uri: getRedirectUri(),
    ...(state ? { state } : {}),
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

/** Exchange authorization code for tokens */
export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token exchange failed: ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/** Refresh an expired access token */
async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${getClientId()}:${getClientSecret()}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token refresh failed: ${err}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Spotify may not return a new refresh token
    expiresIn: data.expires_in,
  };
}

/** Store tokens in the spotify_auth table (single-row, replaces existing) */
export async function storeTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  spotifyUserId: string;
  spotifyDisplayName?: string;
}) {
  // Delete any existing auth rows
  db.delete(spotifyAuth).run();

  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

  db.insert(spotifyAuth).values({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
    spotifyUserId: tokens.spotifyUserId,
    spotifyDisplayName: tokens.spotifyDisplayName || null,
  }).run();
}

/** Get a valid access token, auto-refreshing if needed */
export async function getValidToken(): Promise<string | null> {
  const rows = db.select().from(spotifyAuth).all();
  if (rows.length === 0) return null;

  const auth = rows[0];
  const expiresAt = new Date(auth.expiresAt).getTime();
  const now = Date.now();

  // Refresh if token expires in less than 5 minutes
  if (now > expiresAt - 5 * 60 * 1000) {
    try {
      const refreshed = await refreshAccessToken(auth.refreshToken);
      const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

      db.update(spotifyAuth)
        .set({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: newExpiresAt,
        })
        .where(eq(spotifyAuth.id, auth.id))
        .run();

      return refreshed.accessToken;
    } catch {
      // Refresh failed — token may be revoked
      return null;
    }
  }

  return auth.accessToken;
}

/** Get current auth status */
export function getAuthStatus(): { connected: boolean; userId?: string; displayName?: string } {
  const rows = db.select().from(spotifyAuth).all();
  if (rows.length === 0) return { connected: false };
  return {
    connected: true,
    userId: rows[0].spotifyUserId,
    displayName: rows[0].spotifyDisplayName || undefined,
  };
}

/** Disconnect Spotify (remove tokens) */
export function disconnect() {
  db.delete(spotifyAuth).run();
}

// ── Spotify API Client ───────────────────────────────────────────────

interface SpotifyApiOptions {
  /** Delay between paginated requests in ms (default: 100) */
  rateDelay?: number;
}

/** Make an authenticated Spotify API request with auto-retry on 429 */
export async function spotifyFetch(
  endpoint: string,
  options: SpotifyApiOptions & RequestInit = {}
): Promise<Response> {
  const { rateDelay = 100, ...fetchOptions } = options;
  const token = await getValidToken();
  if (!token) throw new Error("Not authenticated with Spotify");

  const url = endpoint.startsWith("http") ? endpoint : `${SPOTIFY_API_BASE}${endpoint}`;

  let retries = 0;
  while (retries < 5) {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        Authorization: `Bearer ${token}`,
        ...fetchOptions.headers,
      },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "1", 10);
      await sleep(retryAfter * 1000);
      retries++;
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Spotify API error ${res.status}: ${errText}`);
    }

    // Rate-limit courtesy delay
    if (rateDelay > 0) await sleep(rateDelay);

    return res;
  }

  throw new Error("Spotify API: too many retries (429)");
}

/** Fetch user profile */
export async function fetchUserProfile(): Promise<{ id: string; display_name: string }> {
  const res = await spotifyFetch("/me");
  return res.json();
}

/** Paginated fetch helper — yields items from Spotify paging objects */
export async function* paginatedFetch<T>(
  initialUrl: string,
  options?: SpotifyApiOptions
): AsyncGenerator<T> {
  let url: string | null = initialUrl.startsWith("http")
    ? initialUrl
    : `${SPOTIFY_API_BASE}${initialUrl}`;

  while (url) {
    const res = await spotifyFetch(url, options);
    const data = await res.json();

    const items = data.items || [];
    for (const item of items) {
      yield item;
    }

    url = data.next || null;
  }
}

/** Fetch audio features for a batch of track IDs (max 100 per request) */
export async function fetchAudioFeatures(
  trackIds: string[]
): Promise<Map<string, { tempo: number; energy: number; danceability: number; valence: number; key: number; mode: number }>> {
  const map = new Map<string, { tempo: number; energy: number; danceability: number; valence: number; key: number; mode: number }>();

  // Batch in chunks of 100
  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    try {
      const res = await spotifyFetch(`/audio-features?ids=${batch.join(",")}`);
      const data = await res.json();
      for (const af of data.audio_features || []) {
        if (af) {
          map.set(af.id, {
            tempo: af.tempo,
            energy: af.energy,
            danceability: af.danceability,
            valence: af.valence,
            key: af.key,
            mode: af.mode,
          });
        }
      }
    } catch {
      // Skip failed batches
    }
  }

  return map;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
