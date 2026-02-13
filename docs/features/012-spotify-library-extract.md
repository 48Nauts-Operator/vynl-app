# Feature: Spotify Library Extract

**Status:** Shipped
**Priority:** High
**Label:** Core Feature
**Created:** 2026-02-13

## Summary

Import your entire Spotify library metadata into Vynl -- playlists, liked songs, and audio features -- then match every track against your local beets library. Matched playlists become native Vynl playlists. Unmatched tracks are automatically added to a wishlist for later download via spotDL. The result is a complete picture of what you have locally vs. what lives only on Spotify, along with one-click tools to close the gap.

## Problem

If you have years of Spotify playlists but also maintain a local music library (via beets), there is no easy way to:
- See which Spotify tracks you already own locally
- Recreate your Spotify playlists with local files for offline or Sonos playback
- Identify what is missing from your local collection
- Batch-download the gaps

This feature bridges the two worlds with a single extraction pipeline.

## Prerequisites / Setup

### 1. Create a Spotify Developer App

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in a name (e.g., "Vynl") and description
4. Add a Redirect URI -- see the critical note below

### 2. Redirect URI (Critical)

The Redirect URI **must** use `http://127.0.0.1:<PORT>/api/spotify/callback` -- not `localhost`, and not your LAN IP.

**Why:** Spotify's authorization server enforces HTTPS for all redirect URIs **except** explicit IPv4/IPv6 loopback addresses (`127.0.0.1` / `[::1]`). The Developer Dashboard will silently accept a LAN IP like `http://192.168.74.179:3101/...`, but the auth server will reject it at runtime with `INVALID_CLIENT: Invalid redirect URI`. Using `localhost` is also unreliable because it may resolve to `::1` on some systems while Spotify expects the literal string to match.

**Correct:**
```
http://127.0.0.1:3101/api/spotify/callback
```

**Incorrect (will fail at runtime):**
```
http://localhost:3101/api/spotify/callback
http://192.168.74.179:3101/api/spotify/callback
https://myhost:3101/api/spotify/callback
```

After the OAuth callback lands on `127.0.0.1`, the callback handler redirects the browser to `NEXT_PUBLIC_VYNL_HOST` (your LAN IP) so you end up back on the right address.

### 3. Environment Variables

Add the following to your `.env.local` or environment:

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | From the Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Yes | From the Spotify Developer Dashboard |
| `SPOTIFY_REDIRECT_URI` | Yes | Must be `http://127.0.0.1:3101/api/spotify/callback` |
| `NEXT_PUBLIC_VYNL_HOST` | Recommended | Your LAN address (e.g., `http://192.168.74.179:3101`) for post-callback redirect |

### 4. Required OAuth Scopes

The following scopes are requested automatically during the OAuth flow:

| Scope | Purpose |
|---|---|
| `user-library-read` | Access liked/saved tracks |
| `playlist-read-private` | Access private playlists |
| `playlist-read-collaborative` | Access collaborative playlists |
| `user-read-private` | Read user profile (ID) |
| `user-read-email` | Read user email (display name) |

### 5. spotDL (Optional, for Downloads)

To download wishlist items, install [spotDL](https://github.com/spotDL/spotify-downloader):

```bash
pip install spotdl
```

The `spotdl` binary must be on the system PATH.

## Architecture

### OAuth Flow

The feature uses the **Authorization Code** flow (not PKCE), since the client secret is available server-side. The flow is:

```
Browser                     Vynl Server                  Spotify
  │                              │                          │
  │─ GET /api/spotify/auth ─────>│                          │
  │                              │── 302 Redirect ─────────>│
  │<──────────────── Spotify login page ───────────────────>│
  │                              │<── GET /callback?code= ──│
  │                              │── POST /api/token ──────>│
  │                              │<── { access_token } ─────│
  │                              │── GET /v1/me ───────────>│
  │                              │<── { id, display_name } ─│
  │                              │── store tokens in DB     │
  │<── 302 → /settings?spotify=connected ──│                │
```

Key implementation details:
- **Token storage**: Single-row in the `spotify_auth` table (existing row is deleted before inserting new tokens)
- **Auto-refresh**: `getValidToken()` checks if the token expires within 5 minutes and silently refreshes using the stored refresh token
- **Rate limiting**: All API calls go through `spotifyFetch()` which retries on HTTP 429 with `Retry-After` header, up to 5 retries, with a 100ms courtesy delay between requests
- **CSRF state**: A random 16-byte hex state parameter is generated and passed through the OAuth flow

### Background Extraction Pipeline

The extraction runs as a fire-and-forget background job using `globalThis` for HMR persistence (the standard Vynl pattern for long-running tasks in Next.js dev mode). The UI polls `GET /api/spotify/extract` every 2 seconds for progress updates.

```
POST /api/spotify/extract
        │
        v
  startExtract()
        │ (creates snapshot row, returns immediately)
        v
  runExtraction(job) ── runs in background, not awaited
        │
        ├── Phase 1: Fetch playlists
        ├── Phase 2: Fetch playlist tracks (per playlist)
        ├── Phase 3: Fetch liked songs
        ├── Phase 4: Fetch audio features (batched)
        ├── Phase 5: Match against local library
        ├── Phase 6: Mirror matched playlists as Vynl playlists
        └── Phase 7: Populate wishlist with unmatched tracks
```

### Shadow Table Pattern

Spotify data lives in its own tables (`spotify_tracks`, `spotify_playlists`, etc.) separate from the core Vynl tables (`tracks`, `playlists`). The link between them is a nullable `localTrackId` foreign key on `spotify_tracks` that points to a matched local `tracks` row. This design means:

- Spotify data never pollutes the core library
- You can re-extract without losing local data
- The match relationship is explicit and auditable (method + confidence stored)
- Unmatched tracks are clearly identifiable for the wishlist

### Matching Engine

The matching engine builds an in-memory index of all local tracks on every extraction run, then matches each Spotify track through a cascade of strategies:

```
Spotify Track
    │
    ├─ [1] ISRC exact match ──> confidence 1.0
    │      (only ~1.6% of beets tracks have ISRCs)
    │
    ├─ [2] Normalized artist + title exact ──> confidence 0.95
    │      (primary method -- handles most matches)
    │
    └─ [3] Partial match ──> confidence 0.7
           (primary artist substring + title contained)
```

**Normalization rules** (applied to both Spotify and local track strings):
- Lowercase everything
- Strip parenthetical tags: `(feat. ...)`, `(ft. ...)`, `(with ...)`, `(remix)`, `(remastered ...)`, `(deluxe ...)`, `(live ...)`, `(bonus ...)`
- Normalize smart quotes to ASCII equivalents
- Strip remaining punctuation (except `'`, `"`, `-`)
- Collapse whitespace
- For artists: normalize separators (`&`, `,`, `and`) to spaces

## Database Schema

Six new tables plus one new column on the existing `tracks` table.

### `spotify_auth` -- OAuth Token Storage

Single-row table holding the current Spotify connection.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `access_token` | TEXT NOT NULL | Current OAuth access token |
| `refresh_token` | TEXT NOT NULL | OAuth refresh token for renewal |
| `expires_at` | TEXT NOT NULL | ISO 8601 expiry timestamp |
| `spotify_user_id` | TEXT NOT NULL | Spotify user ID (e.g., `"abc123"`) |
| `spotify_display_name` | TEXT | Display name from Spotify profile |

### `spotify_snapshots` -- Extraction Run History

Each extraction creates one snapshot row to track progress and final stats.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `status` | TEXT NOT NULL | `"running"`, `"complete"`, `"error"`, or `"cancelled"` |
| `total_playlists` | INTEGER | Number of Spotify playlists found |
| `total_tracks` | INTEGER | Total unique tracks extracted |
| `total_liked_songs` | INTEGER | Number of liked/saved songs |
| `matched_tracks` | INTEGER | Tracks successfully matched to local library |
| `unmatched_tracks` | INTEGER | Tracks with no local match |
| `started_at` | TEXT | ISO 8601 timestamp when extraction began |
| `completed_at` | TEXT | ISO 8601 timestamp when extraction finished |

### `spotify_playlists` -- Extracted Playlist Metadata

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `snapshot_id` | INTEGER FK | References `spotify_snapshots(id)`, CASCADE delete |
| `spotify_id` | TEXT NOT NULL | Spotify playlist ID |
| `name` | TEXT NOT NULL | Playlist name |
| `description` | TEXT | Playlist description |
| `image_url` | TEXT | Playlist cover image URL from Spotify |
| `track_count` | INTEGER | Number of tracks reported by Spotify |
| `vynl_playlist_id` | INTEGER FK | References `playlists(id)`, SET NULL -- link to mirrored Vynl playlist |

### `spotify_tracks` -- Extracted Track Metadata + Match Results

The central table linking Spotify tracks to local library tracks.

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `snapshot_id` | INTEGER FK | References `spotify_snapshots(id)`, CASCADE delete |
| `spotify_id` | TEXT NOT NULL | Spotify track ID |
| `spotify_uri` | TEXT | Spotify URI (e.g., `spotify:track:abc123`) |
| `title` | TEXT NOT NULL | Track title |
| `artist` | TEXT NOT NULL | Artist name(s), comma-separated |
| `album` | TEXT | Album name |
| `isrc` | TEXT | ISRC code from Spotify metadata |
| `duration_ms` | INTEGER | Track duration in milliseconds |
| `cover_url` | TEXT | Album cover URL from Spotify |
| `preview_url` | TEXT | 30-second preview URL (if available) |
| `is_liked_song` | BOOLEAN | Whether the track is in the user's liked songs |
| `bpm` | REAL | Tempo from Spotify Audio Features |
| `energy` | REAL | Energy (0.0-1.0) from Spotify Audio Features |
| `danceability` | REAL | Danceability (0.0-1.0) from Spotify Audio Features |
| `valence` | REAL | Valence/positivity (0.0-1.0) from Spotify Audio Features |
| `audio_key` | INTEGER | Musical key (0-11, Pitch Class notation) |
| `audio_mode` | INTEGER | Mode (0 = minor, 1 = major) |
| `local_track_id` | INTEGER FK | References `tracks(id)`, SET NULL -- the matched local track |
| `match_method` | TEXT | `"isrc"` or `"fuzzy"`, null if unmatched |
| `match_confidence` | REAL | Confidence score (1.0, 0.95, or 0.7) |

### `spotify_playlist_tracks` -- Playlist/Track Junction

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `spotify_playlist_id` | INTEGER FK | References `spotify_playlists(id)`, CASCADE delete |
| `spotify_track_id` | INTEGER FK | References `spotify_tracks(id)`, CASCADE delete |
| `position` | INTEGER NOT NULL | Track position within the playlist |

### `wish_list` -- Tracks to Acquire

Populated with unmatched Spotify tracks (and potentially other sources in the future).

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `type` | TEXT NOT NULL | Source type: `"spotify_missing"`, `"similar_music"`, `"artist_discovery"` |
| `seed_title` | TEXT | Track title |
| `seed_artist` | TEXT | Artist name |
| `seed_album` | TEXT | Album name |
| `spotify_track_id` | INTEGER FK | References `spotify_tracks(id)`, SET NULL |
| `spotify_uri` | TEXT | Spotify URI for spotDL download |
| `isrc` | TEXT | ISRC code for alternative matching |
| `cover_url` | TEXT | Album cover URL |
| `spotify_playlist_names` | TEXT | JSON array of playlist names this track belongs to |
| `status` | TEXT NOT NULL | `"pending"`, `"downloading"`, `"completed"`, `"dismissed"` |
| `created_at` | TEXT | ISO 8601 creation timestamp |

### Modified: `tracks` Table

One new column added:

| Column | Type | Description |
|---|---|---|
| `isrc` | TEXT | International Standard Recording Code, used for exact matching against Spotify tracks |

## API Endpoints

### `GET /api/spotify/auth`

Initiates the Spotify OAuth flow. Generates a random CSRF state token and redirects the browser to Spotify's authorization page.

**Response:** `302 Redirect` to `https://accounts.spotify.com/authorize?...`

### `GET /api/spotify/callback`

OAuth callback handler. Receives the authorization code from Spotify, exchanges it for tokens, fetches the user profile, stores everything in the `spotify_auth` table, and redirects to the settings page.

**Query Parameters:**
- `code` -- Authorization code from Spotify
- `error` -- Error string if the user denied access

**Response:** `302 Redirect` to `${NEXT_PUBLIC_VYNL_HOST}/settings?spotify=connected` (or `?spotify=error&reason=...` on failure)

### `GET /api/spotify/status`

Returns the current Spotify connection status.

**Response:**
```json
{
  "connected": true,
  "userId": "spotify_user_id",
  "displayName": "John Doe"
}
```

### `DELETE /api/spotify/status`

Disconnects Spotify by deleting all stored tokens.

**Response:**
```json
{ "disconnected": true }
```

### `POST /api/spotify/extract`

Starts a new background extraction. Fails if an extraction is already running.

**Response:**
```json
{ "snapshotId": 1 }
```

### `GET /api/spotify/extract`

Polls the current extraction status. Returns phase, progress counters, and phase detail text.

**Response (idle):**
```json
{ "status": "idle" }
```

**Response (running):**
```json
{
  "snapshotId": 1,
  "status": "running",
  "phase": "playlist_tracks",
  "phaseDetail": "Playlist 3/12: Road Trip Classics",
  "totalPlaylists": 12,
  "totalTracks": 847,
  "totalLikedSongs": 0,
  "matchedTracks": 0,
  "unmatchedTracks": 0,
  "processedTracks": 847,
  "startedAt": "2026-02-13T10:00:00.000Z"
}
```

**Response (complete):**
```json
{
  "snapshotId": 1,
  "status": "complete",
  "phase": "complete",
  "phaseDetail": "Done! 623 matched, 224 unmatched",
  "totalPlaylists": 12,
  "totalTracks": 847,
  "totalLikedSongs": 312,
  "matchedTracks": 623,
  "unmatchedTracks": 224,
  "processedTracks": 847,
  "startedAt": "2026-02-13T10:00:00.000Z"
}
```

### `DELETE /api/spotify/extract`

Cancels a running extraction. The pipeline checks for cancellation between phases and within track processing loops.

**Response:**
```json
{ "cancelled": true }
```

### `POST /api/spotify/download`

Starts downloading pending wishlist items via spotDL. Optionally accepts specific item IDs.

**Request Body:**
```json
{ "ids": [1, 2, 3] }
```
Or empty body / `{}` to download all pending items.

**Response:**
```json
{ "started": true, "total": 15 }
```

### `GET /api/spotify/download`

Polls download progress.

**Response:**
```json
{
  "status": "running",
  "total": 15,
  "processed": 7,
  "succeeded": 6,
  "failed": 1,
  "currentTrack": "Artist Name -- Track Title"
}
```

### `DELETE /api/spotify/download`

Cancels the running download job.

**Response:**
```json
{ "cancelled": true }
```

### `GET /api/wishlist`

Lists wishlist items with optional filtering and pagination.

**Query Parameters:**
- `status` -- Filter by status (`"pending"`, `"downloading"`, `"completed"`, `"dismissed"`)
- `limit` -- Max items per page (default: 100)
- `offset` -- Pagination offset (default: 0)

**Response:**
```json
{
  "items": [ ... ],
  "total": 224,
  "limit": 100,
  "offset": 0
}
```

### `PATCH /api/wishlist`

Update a wishlist item's status (e.g., dismiss it).

**Request Body:**
```json
{ "id": 42, "status": "dismissed" }
```

### `DELETE /api/wishlist`

Remove a wishlist item permanently.

**Query Parameters:**
- `id` -- Item ID to delete

## Extraction Pipeline (7 Phases)

### Phase 1: Fetch Playlists

Fetches all user playlists via `GET /me/playlists` with pagination (50 per page). Each playlist is inserted into `spotify_playlists` with its Spotify ID, name, description, cover image URL, and reported track count.

**Cancellation check:** Between each paginated page.

### Phase 2: Fetch Playlist Tracks

Iterates over each playlist and fetches its tracks via `GET /playlists/{id}/tracks` with pagination (100 per page). Uses Spotify's `fields` parameter to request only needed fields. Local files (`is_local: true`) and tracks without an ID are skipped.

**Deduplication:** A `Map<spotifyId, dbId>` tracks which Spotify tracks have already been inserted. If a track appears in multiple playlists, it is inserted once into `spotify_tracks` and linked via `spotify_playlist_tracks` for each playlist.

**Cancellation check:** Between each track item.

### Phase 3: Fetch Liked Songs

Fetches the user's saved/liked tracks via `GET /me/tracks` with pagination (50 per page). Each track is inserted if new, or updated with `isLikedSong = true` if already seen in a playlist.

**Cancellation check:** Between each liked song.

### Phase 4: Fetch Audio Features

Collects all unique Spotify track IDs from the extraction, then fetches audio features via `GET /audio-features?ids=...` in batches of 100 (Spotify's maximum). Stores BPM, energy, danceability, valence, musical key, and mode on each `spotify_tracks` row.

Failed batches are silently skipped (the Audio Features endpoint occasionally returns null for certain tracks).

### Phase 5: Match Against Local Library

1. Calls `buildTrackIndex()` to create an in-memory index of all local tracks with:
   - `byIsrc`: Map of uppercase ISRC to track ID
   - `byNormalizedKey`: Map of `"normalizedArtist|||normalizedTitle"` to track ID
   - `allTracks`: Array of all tracks with pre-computed normalized strings
2. For each Spotify track in the current snapshot, calls `matchTrack()` with the three-strategy cascade:
   - **ISRC exact match** (confidence 1.0) -- only works for the ~1.6% of beets tracks with ISRCs
   - **Normalized artist+title exact match** (confidence 0.95) -- the primary method
   - **Partial match** (confidence 0.7) -- first two words of normalized artist match as substring + title contained in either direction
3. If matched, updates the `spotify_tracks` row with `localTrackId`, `matchMethod`, and `matchConfidence`

**Progress reporting:** Updates every 100 tracks.

**Cancellation check:** Between each track.

### Phase 6: Mirror Matched Playlists

For each Spotify playlist that has at least one matched track:

1. Creates a new Vynl playlist named `"{Spotify Playlist Name} (Spotify)"` with `isAutoGenerated = true`
2. The description includes the match ratio (e.g., "Mirrored from Spotify. 18/24 tracks matched.")
3. Inserts all matched tracks into `playlist_tracks` preserving their original order
4. Links the Spotify playlist back to the Vynl playlist via `vynlPlaylistId`

Playlists with zero matched tracks are skipped entirely.

### Phase 7: Populate Wishlist

Queries all `spotify_tracks` rows in the current snapshot where `localTrackId IS NULL`. For each unmatched track:

1. Looks up which Spotify playlists contain the track (for context)
2. Creates a `wish_list` row with type `"spotify_missing"`, the track metadata, Spotify URI, ISRC, cover URL, and a JSON array of playlist names

All wishlist items are created with status `"pending"`.

## Matching Engine Details

### `buildTrackIndex()`

Queries all rows from the `tracks` table and builds three lookup structures:

1. **`byIsrc`**: `Map<string, number>` -- ISRC (uppercased) to track ID. Only populated for tracks that have a non-null ISRC.
2. **`byNormalizedKey`**: `Map<string, number>` -- composite key `"normalizedArtist|||normalizedTitle"` to track ID. Every track gets an entry.
3. **`allTracks`**: Array of `{ id, artist, title, normalizedArtist, normalizedTitle }` for the partial-match fallback scan.

The index is built once per extraction run and kept in memory.

### `matchTrack()` Strategy Cascade

| Priority | Strategy | Confidence | Condition |
|---|---|---|---|
| 1 | ISRC exact | 1.0 | Spotify ISRC matches a local track's ISRC (case-insensitive) |
| 2 | Normalized exact | 0.95 | Normalized artist AND normalized title are exact string matches |
| 3 | Partial | 0.7 | First two words of normalized Spotify artist found as substring in local artist AND title is contained (either direction) |

The function returns `null` (no match) if none of the three strategies succeed. The partial match guard requires the primary artist word to be at least 3 characters to avoid false positives on short names.

### Normalization Pipeline

```
Input: "The Beatles (feat. Billy Preston)"
  → lowercase: "the beatles (feat. billy preston)"
  → strip (feat.): "the beatles "
  → collapse whitespace: "the beatles"

Input: "Don't Stop Me Now (Remastered 2011)"
  → lowercase: "don't stop me now (remastered 2011)"
  → strip (remastered): "don't stop me now "
  → normalize quotes: "don't stop me now "
  → collapse whitespace: "don't stop me now"

Artist: "Simon & Garfunkel"
  → lowercase: "simon & garfunkel"
  → normalize separators: "simon garfunkel"
```

## UI: SpotifyExtractCard

The `SpotifyExtractCard` component renders on the Settings page and transitions through the following states:

### State: Not Connected

Shows a description of the feature and a "Connect Spotify" button that navigates to `/api/spotify/auth`.

### State: Connected / Idle

Shows the connected user's display name, a "Disconnect" button, a description of what extraction does, and a "Start Extraction" button.

### State: Extracting (Running)

Displays while the background job is active:
- Animated spinner with the current phase label (e.g., "Fetching Playlist Tracks")
- Progress bar based on phase index (1-8 mapped to 0-100%)
- Phase detail text (e.g., "Playlist 3/12: Road Trip Classics")
- Four stat counters in a grid: Playlists, Tracks, Matched (green), Missing (orange)
- "Cancel" button

The component polls `GET /api/spotify/extract` every 2 seconds.

### State: Complete

Shows a success banner with final stats in a 4-column grid:
- Playlists (ListMusic icon)
- Total tracks (Music2 icon)
- Matched (Disc3 icon, green)
- Wishlist / missing (Download icon, orange)

Includes a "Re-Extract" button to run the pipeline again.

### State: Error

Shows the error message in a red banner with a "Retry" button.

### OAuth Callback Handling

On mount, the component checks URL query parameters for `?spotify=connected` (set by the callback redirect). If found, it refreshes the status and cleans up the URL using `history.replaceState`.

## spotDL Download Integration

The download feature bridges the wishlist to actual file acquisition:

1. **Trigger**: `POST /api/spotify/download` with optional `{ ids: [...] }` body
2. **Scope**: Downloads specific items by ID, or all items with status `"pending"` if no IDs provided
3. **Process**: For each item:
   - Sets status to `"downloading"`
   - Runs `spotdl download <spotify_uri> --output <MUSIC_LIBRARY_PATH>` with a 2-minute timeout
   - On success: sets status to `"completed"`
   - On failure: resets status to `"pending"` (retry-friendly)
4. **State**: Uses `globalThis.__vynl_spotdlJob` for HMR-persistent job tracking
5. **Polling**: `GET /api/spotify/download` returns current progress
6. **Cancellation**: `DELETE /api/spotify/download` signals the loop to stop

The output directory defaults to `MUSIC_LIBRARY_PATH` (or `cwd` as fallback), so downloaded files land directly in the beets library path for subsequent import.

## Files

### New Files

| File | Purpose |
|---|---|
| `src/lib/spotify.ts` | OAuth client, token management, paginated API fetcher, audio features batch fetch |
| `src/lib/spotify-matcher.ts` | Track matching engine with ISRC + fuzzy strategies, normalization functions, index builder |
| `src/lib/spotify-extract.ts` | 7-phase background extraction pipeline, globalThis job state management |
| `src/app/api/spotify/auth/route.ts` | `GET` -- initiates OAuth redirect to Spotify |
| `src/app/api/spotify/callback/route.ts` | `GET` -- handles OAuth callback, exchanges code, stores tokens |
| `src/app/api/spotify/status/route.ts` | `GET` -- auth status; `DELETE` -- disconnect |
| `src/app/api/spotify/extract/route.ts` | `POST` -- start extraction; `GET` -- poll status; `DELETE` -- cancel |
| `src/app/api/spotify/download/route.ts` | `POST` -- start spotDL downloads; `GET` -- poll; `DELETE` -- cancel |
| `src/app/api/wishlist/route.ts` | `GET` -- list wishlist; `PATCH` -- update status; `DELETE` -- remove item |
| `src/components/spotify/SpotifyExtractCard.tsx` | Settings page card with connect/extract/status UI |

### Modified Files

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | Added 6 tables (`spotify_auth`, `spotify_snapshots`, `spotify_playlists`, `spotify_tracks`, `spotify_playlist_tracks`, `wish_list`) + `isrc` column on `tracks` + TypeScript types |

## Design Decisions

### Why Authorization Code Flow (not PKCE)?

PKCE is designed for public clients (SPAs, mobile apps) that cannot keep a secret. Since Vynl is a self-hosted server-side app with access to `SPOTIFY_CLIENT_SECRET`, the standard Authorization Code flow is simpler and equally secure.

### Why globalThis for job state?

Next.js hot-module replacement (HMR) in dev mode re-evaluates module-level variables on every file change. Using `globalThis.__vynl_spotifyExtract` ensures the background job reference survives HMR reloads. This is the same pattern used by other Vynl background jobs (library import, podcast analysis).

### Why shadow tables instead of merging into `tracks`?

Spotify tracks are metadata-only -- they do not represent playable local files. Inserting them into the core `tracks` table would pollute the library with unplayable entries. The shadow table approach keeps Spotify data isolated while still enabling cross-references via `localTrackId`.

### Why is fuzzy matching the primary method?

Only ~1.6% of tracks imported via beets have ISRC codes populated. While ISRC is the gold standard for track identification, it is rarely available in local library metadata. The normalized artist+title match at 0.95 confidence handles the vast majority of matches accurately.

### Why re-extract instead of incremental sync?

The extraction creates a snapshot -- a point-in-time copy of the Spotify library. Re-extracting creates a new snapshot with fresh data. This was chosen over incremental sync for simplicity and because Spotify does not provide a reliable change-detection API for library-wide changes. Future iterations could compare snapshots to identify additions/removals.

## Open Questions

- Should the extraction compare against previous snapshots to detect newly added/removed Spotify tracks?
- Should matched Vynl playlists be updated on re-extraction, or should new playlists be created each time?
- Should the wishlist support manual additions (not just Spotify-sourced missing tracks)?
- How to handle tracks that match at 0.7 confidence -- should users be able to confirm/reject these?
- Should audio features from Spotify be copied to local `track_audio_features` rows for matched tracks (useful for AI DJ)?
