# Feature: Song Recognition (Shazam-style)

**Status:** Planned
**Priority:** Medium
**Label:** Mobile / Core
**Created:** 2026-02-11

## Summary

Built-in song recognition — hear a song you love (at a bar, on the radio, in a shop), tap a button, Vynl identifies it, and automatically adds it to your Wish List for discovery and acquisition. Like Shazam, but integrated directly into the Vynl ecosystem.

## Problem

You hear an amazing song and don't know what it is. Currently you'd:
1. Open Shazam or Google to identify it
2. Remember the result
3. Manually search for it later
4. Try to find and download it

With Vynl's Wish List + Usenet pipeline already planned, all we're missing is the **identification** step to close the loop entirely.

## Solution

### Core Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Listen  │────▶│   Identify   │────▶│  Wish List   │────▶│ Download │
│  (mic)   │     │  (API match) │     │  (auto-add)  │     │ (Usenet) │
└──────────┘     └──────────────┘     └──────────────┘     └──────────┘
   tap button      audio fingerprint     artist + track      auto-acquire
   record 5-10s    → song match          added as wish       (if enabled)
```

1. User taps **"Recognize"** button (floating action button or nav item)
2. App records 5-10 seconds of ambient audio via microphone
3. Audio is sent to a recognition API for fingerprinting
4. Match returns: song title, artist, album, cover art
5. Result is shown with options:
   - **Add to Wish List** (default) — creates a wish list entry for acquisition
   - **Search Library** — check if it's already in your collection
   - **Dismiss** — not interested
6. If auto-push is enabled in settings, it skips the confirmation and goes straight to Wish List

### Recognition APIs

| Service | Type | Cost | Quality |
|---|---|---|---|
| **AudD** | Cloud API | Free tier (300 req/day), paid plans | Good, music-focused |
| **ACRCloud** | Cloud API | Free tier (100 req/day), paid plans | Excellent, used by many apps |
| **Shazam (via RapidAPI)** | Cloud API | Free tier available | Best recognition quality |
| **Chromaprint + MusicBrainz** | Open source / self-hosted | Free | Good for known catalog, no ambient recognition |

**Recommended**: ACRCloud or AudD for ambient recognition (cloud API). Chromaprint is great for matching files you already have but not for identifying songs from ambient audio.

### UI: Recognition Button

#### Mobile (primary use case)
- Floating action button (FAB) on the main screen — big, easy to tap quickly
- Tap → recording animation (pulsing microphone icon)
- 5-10 second countdown
- Result card slides up with song info + cover art

#### Desktop
- Button in the sidebar or top bar
- Same flow but less common use case (usually mobile)

### Result Card

```
┌─────────────────────────────────┐
│  🎵 Song Recognized!            │
│                                  │
│  ┌────────┐  "Superstition"     │
│  │ cover  │  Stevie Wonder       │
│  │  art   │  Talking Book (1972) │
│  └────────┘                      │
│                                  │
│  [Add to Wish List]  [Dismiss]  │
│  [Already in Library ✓]         │
└─────────────────────────────────┘
```

If the song is already in the library, show a green checkmark and offer to play it instead.

## Data Model

```sql
CREATE TABLE IF NOT EXISTS song_recognitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  cover_url TEXT,
  recognition_service TEXT,      -- "acr_cloud" | "audd" | "shazam"
  confidence REAL,               -- 0.0 to 1.0
  matched_track_id INTEGER REFERENCES tracks(id),  -- if found in library
  wish_id INTEGER REFERENCES wish_list(id),         -- if added to wish list
  location TEXT,                 -- optional: where you heard it (GPS or manual tag)
  recognized_at TEXT DEFAULT (datetime('now'))
);
```

The `location` field is optional — could be fun to see "songs I discovered at Bar X" later, but not essential for v1.

## API Endpoints

### `POST /api/recognize`
Submit audio for recognition.
- Body: audio blob (WebM/WAV, 5-10 seconds)
- Returns: `{ match: { title, artist, album, coverUrl, confidence }, inLibrary: boolean, trackId?: number }`

### `POST /api/recognize/add-to-wishlist`
Add a recognition result to the wish list.
- Body: `{ recognitionId: number }`
- Returns: `{ wishId: number }`

## Settings

```
Recognition Service: [ACRCloud ▼]
API Key: [••••••••••]
Auto-add to Wish List: [toggle]
Save recognition history: [toggle]
```

## Phases

### Phase 1: Core Recognition
- ACRCloud or AudD API integration
- Record button in the app
- Result display with "Add to Wish List" action
- Recognition history

### Phase 2: Smart Integration
- Auto-check if song is already in library
- Auto-add to Wish List (configurable)
- "Songs I discovered" page with recognition history
- Location tagging (optional)

### Phase 3: Mobile PWA
- Works as installed PWA on phone
- Quick-launch from home screen
- Background recording support (if platform allows)
- Push notification when Wish List item is acquired

## Dependencies

- Recognition API account (ACRCloud, AudD, or Shazam via RapidAPI)
- Microphone access (browser `getUserMedia` API)
- Wish List feature (006) for the acquisition pipeline
- Usenet integration (009) for automated downloading

## Relationship to Other Features

- **Wish List (006)**: Recognition results feed directly into the wish list
- **Usenet (009)**: Recognized songs can be auto-downloaded if the full pipeline is set up
- **AI DJ (007)**: Recognized songs could influence DJ preferences ("user likes this style")
- **Ratings (shipped)**: Once acquired, rate the song you discovered
