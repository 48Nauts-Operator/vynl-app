# Feature: Wish List (AI Music Discovery)

**Status:** Planned
**Priority:** Medium
**Label:** Core Feature
**Created:** 2026-02-11

## Summary

A "Wish List" system that lets users flag songs or artists they want more of, then uses AI to discover similar music, find purchase options, and eventually automate acquisition via Usenet.

## Problem

When browsing the library, users often encounter tracks they love — especially from compilations (e.g., "UK Top 40 Singles Chart") that aren't proper albums. There's currently no way to:
- Flag "I want more music like this" or "I want more from this artist"
- Discover related songs, albums, or artists automatically
- Find where to purchase or acquire the discovered music
- Track what you're looking for vs. what you've already found

## Solution

### Core Flow

1. User right-clicks a **track** or **album** in any list (album detail, library, stats)
2. Context menu shows **"Add to Wish List"**
3. Two wish list modes:
   - **"Find similar music"** — triggered from a song. AI finds tracks with similar style, genre, mood, era
   - **"More from this artist"** — triggered from a song or album. AI finds the artist's discography, best albums, deep cuts
4. Wish list items appear on a dedicated **Wish List** page
5. AI processes each wish list entry and returns curated recommendations with cover art
6. Each recommendation shows purchase/acquisition options

### Wish List Entry Types

| Type | Trigger | AI Goal |
|---|---|---|
| Similar Music | Right-click song → "Find similar" | Find tracks with similar vibe, genre, tempo |
| Artist Discovery | Right-click song/album → "More from artist" | Full discography, best albums, essential tracks |

### Wish List Page

Sidebar nav item: "Wish List" (with icon)

Each entry shows:
- Original track/artist that inspired the search
- AI-generated recommendations (albums + tracks)
- Cover art for each recommendation
- Status: Pending / Discovered / Acquired / Dismissed

### Recommendation Card

Each AI recommendation displays:
- Album/track name + artist
- Cover art (fetched from MusicBrainz / Discogs / web)
- Release year
- Genre tags
- **Purchase options**: links to buy (Bandcamp, Amazon, iTunes, etc.) with prices where available
- **Usenet download** button (Phase 2 — see below)

### AI Discovery Engine

Uses LLM (Claude or similar) to:
1. Take the seed track/artist + any available metadata (genre, year, mood)
2. Generate a list of recommended albums/tracks with reasoning
3. Enrich with metadata from MusicBrainz, Discogs, or similar APIs
4. Fetch cover art and purchase links

### Phase 2: Usenet Integration

Future addition — requires separate setup:
- Configure Usenet provider (server, credentials)
- Configure NZB indexer (NZBgeek, Dog, etc.)
- "Download via Usenet" button on recommendations
- Searches NZB indexer for the album/track
- Sends NZB to download client (SABnzbd / NZBGet)
- Auto-imports downloaded files into Vynl library via beets

> **Note:** Usenet details TBD — provider/indexer configuration will be designed when this phase begins.

## Data Model

```sql
CREATE TABLE wish_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,               -- "similar_music" | "artist_discovery"
  seed_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  seed_title TEXT NOT NULL,
  seed_artist TEXT NOT NULL,
  seed_album TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- "pending" | "discovered" | "completed" | "dismissed"
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE wish_list_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wish_id INTEGER NOT NULL REFERENCES wish_list(id) ON DELETE CASCADE,
  title TEXT NOT NULL,              -- album or track title
  artist TEXT NOT NULL,
  album TEXT,
  year INTEGER,
  genre TEXT,
  cover_url TEXT,
  reasoning TEXT,                   -- AI explanation of why this was recommended
  purchase_links TEXT,              -- JSON: [{ store, url, price }]
  status TEXT NOT NULL DEFAULT 'suggested',  -- "suggested" | "acquired" | "dismissed"
  created_at TEXT DEFAULT (datetime('now'))
);
```

## UI Integration Points

### Context Menu Additions
- Album detail track list: right-click → "Add to Wish List" → submenu: "Find similar" / "More from artist"
- Album header: right-click → "More from this artist"
- Library page track rows: same context menu options
- Stats page track rows: same context menu options

### Sidebar
- New nav item: "Wish List" (between Stats and Discover, or similar placement)
- Badge showing count of pending items

### Wish List Page Tabs
- **Pending** — items waiting for AI discovery
- **Discovered** — items with recommendations ready to browse
- **Acquired** — items that have been purchased/downloaded

## Dependencies

- AI/LLM integration for discovery (Claude API or similar)
- MusicBrainz / Discogs API for metadata enrichment
- Phase 2: Usenet provider + NZB indexer configuration

## Open Questions

- Should "Find similar" use the track's audio features (if available) or just metadata?
- Rate limiting for AI discovery — process immediately or batch?
- Usenet provider/indexer details — to be defined when Phase 2 begins
