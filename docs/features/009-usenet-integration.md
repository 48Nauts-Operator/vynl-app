# Feature: Usenet Music Download Integration

**Status:** Planned
**Priority:** Medium
**Label:** Power User
**Created:** 2026-02-11

## Summary

Integrate Usenet-based music downloading into Vynl. Users configure their Usenet provider, NZB indexer, and download client. When a track or album is found (via Wish List or manual search), Vynl searches the indexer, grabs the NZB, sends it to the download client, and auto-imports the result into the library via beets.

Hidden behind a settings toggle — not visible by default.

## Problem

After discovering music through the Wish List or AI DJ recommendations, there's no way to acquire it from within Vynl. Users currently have to leave the app, manually search for music, download it, and import it. A Usenet pipeline automates this entire flow.

## Solution

### Visibility: Settings Toggle

The entire Usenet feature is **hidden by default**. To enable:

1. Go to **Settings**
2. Under a "Power Features" or "Advanced" section, toggle **"Usenet Downloads"** on
3. Once enabled:
   - A configuration panel appears in Settings for provider/indexer/client setup
   - "Download via Usenet" buttons appear in the Wish List and search results
   - A "Downloads" nav item appears in the sidebar

### Configuration (Settings Page)

When Usenet is enabled, the Settings page shows:

#### Usenet Provider
- **Server**: hostname (e.g., `news.eweka.nl`, `news.supernews.com`)
- **Port**: typically 563 (SSL) or 119
- **SSL**: toggle (default: on)
- **Username**: provider login
- **Password**: provider password (stored encrypted)
- **Connections**: max concurrent connections (default: 10)

#### NZB Indexer
- **Indexer URL**: e.g., `https://nzbgeek.info`, `https://dognzb.cr`
- **API Key**: indexer API key
- **Categories**: music category IDs (varies per indexer)
- Test connection button

#### Download Client
- **Client type**: SABnzbd or NZBGet
- **URL**: e.g., `http://localhost:8080`
- **API Key**: client API key
- **Download folder**: where completed downloads land (e.g., `/Volumes/Music/downloads/`)
- **Category**: category name in the client for music downloads
- Test connection button

#### Post-Processing
- **Auto-import**: toggle — automatically run beets import on completed downloads
- **Import mode**: "Auto-tag" (beets -q) or "No auto-tag" (beets --noautotag)
- **Clean up**: delete NZB files after successful import
- **Move to library**: move imported files to the library path

### Download Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. Search   │────▶│  2. Select   │────▶│  3. Download │────▶│  4. Import   │
│  NZB Indexer │     │  Best Match  │     │  via Client  │     │  via Beets   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     query               NZB file            SABnzbd/            beets import
  artist+album          selection            NZBGet              → library
```

1. **Search**: Query the NZB indexer API with artist + album (or track) name
2. **Select**: Present results ranked by quality (FLAC > 320kbps > V0 > 256kbps)
   - Show: release name, size, format, age, indexer score
   - User picks or auto-select best match
3. **Download**: Send NZB URL to SABnzbd/NZBGet via their API
   - Track download progress
   - Handle failures/retries
4. **Import**: Once download completes:
   - Run beets import on the download folder
   - Auto-tag and organize into library
   - Trigger library re-scan
   - Update Wish List item status to "Acquired"

### Search Integration Points

"Download via Usenet" buttons appear in:
- **Wish List** recommendations → search for the recommended album/track
- **Album detail** → "Find better quality" or "Re-download" option
- **Manual search** → dedicated search page within the Downloads section

### Downloads Page

When Usenet is enabled, a "Downloads" page shows:
- **Active downloads**: progress bars, ETA, speed
- **Queue**: pending downloads waiting to start
- **History**: completed downloads with import status
- **Failed**: downloads that errored with retry option

## Data Model

```sql
CREATE TABLE IF NOT EXISTS usenet_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,           -- encrypted for sensitive fields
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS download_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,           -- what we're downloading (album/track name)
  artist TEXT NOT NULL,
  nzb_url TEXT,                  -- NZB download URL from indexer
  nzb_name TEXT,                 -- release name
  indexer_guid TEXT,             -- indexer's unique ID
  format TEXT,                   -- "flac" | "mp3_320" | "mp3_v0" etc.
  size_bytes INTEGER,
  client_id TEXT,                -- ID in SABnzbd/NZBGet
  wish_id INTEGER REFERENCES wish_list(id),  -- linked wish list item
  status TEXT NOT NULL DEFAULT 'searching',
    -- "searching" | "queued" | "downloading" | "completed" | "importing" | "imported" | "failed"
  progress REAL DEFAULT 0,      -- 0.0 to 1.0
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

## API Endpoints

### `GET /api/usenet/search`
Search the NZB indexer.
- Params: `?artist=X&album=Y` or `?query=freetext`
- Returns: list of NZB results with title, size, format, age, score

### `POST /api/usenet/download`
Send an NZB to the download client.
- Body: `{ nzbUrl, title, artist, wishId? }`
- Returns: `{ downloadId, clientId, status }`

### `GET /api/usenet/status`
Get status of all active/recent downloads.
- Returns: array of download queue entries with progress

### `POST /api/usenet/test`
Test connection to provider/indexer/client.
- Body: `{ type: "provider" | "indexer" | "client" }`
- Returns: `{ success: boolean, message: string }`

## Settings Feature Flag

```ts
// In FeatureFlags type
usenet: boolean;  // default: false

// Settings page shows Usenet config panel only when enabled
// Sidebar shows Downloads nav only when enabled
// Wish List shows download buttons only when enabled
```

## Phases

### Phase 1: Configuration & Search
- Settings UI for provider/indexer/client configuration
- Test connection buttons
- NZB indexer search API
- Search results display with format/quality info

### Phase 2: Download Pipeline
- SABnzbd API integration (most common client)
- Download queue management
- Progress tracking
- Downloads page with active/history views

### Phase 3: Auto-Import
- Watch download folder for completed downloads
- Auto-run beets import
- Link back to Wish List items
- Library re-scan after import

### Phase 4: NZBGet Support + Quality Preferences
- NZBGet API integration (alternative client)
- Quality preference settings (prefer FLAC, fallback to 320kbps, etc.)
- Duplicate detection (don't download what's already in library)
- Bandwidth scheduling (download during off-hours)

## Security Considerations

- Usenet credentials stored encrypted in the database (not plaintext)
- API keys for indexer/client stored encrypted
- The feature is hidden by default — no accidental exposure
- All Usenet traffic uses SSL by default
- No credentials exposed in API responses (masked in UI)

## Dependencies

- NZB indexer account (NZBgeek, Dog, NZBFinder, etc.)
- Usenet provider account (Eweka, Supernews, Newshosting, etc.)
- SABnzbd or NZBGet installed and running
- Beets for post-download import (already integrated)

## Relationship to Other Features

- **Wish List (006)**: Primary trigger — "Download" button on recommendations
- **AI DJ (007)**: Could suggest downloading missing tracks to fill gaps in a party set
- **Library Health (004)**: Could detect low-quality files and offer Usenet re-download in better quality
