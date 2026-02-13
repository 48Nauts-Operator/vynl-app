# Feature: Song Stories & Music Intelligence

**Status:** Planned
**Priority:** High
**Label:** Core Feature
**Created:** 2026-02-11

## Summary

Click on any song to see its full story: who wrote it, who produced it, whether it's a cover, chart positions, awards, and an AI-generated backstory. Extends the database with rich music credits and metadata. Includes an Analytics tab in Stats showing songwriter networks, prolific producers, and cover chains.

## Problem

Music has incredible stories behind it — who wrote it, why, what inspired it, whether it's a cover of something from 1965. But none of this shows up in a typical music player. Users listen to songs without knowing that:
- "Tainted Love" by Soft Cell is a cover of a 1964 Gloria Jones track
- Max Martin wrote hits for Backstreet Boys, Britney Spears, Taylor Swift, and The Weeknd
- Dieter Bohlen produced 20+ number one hits across different artists
- "Hallelujah" was rejected by Leonard Cohen's label before becoming one of the most covered songs ever

## Solution

### Core Flow

1. User clicks a **track info button** (or long-press / right-click → "Song Story")
2. A **detail card/sheet** slides up with:
   - Performance credits (artist, featured artists)
   - Writing credits (songwriter, composer, lyricist)
   - Production credits (producer, engineer)
   - Cover info (original artist, original year, if applicable)
   - Chart history (peak positions, certifications)
   - Rating (golden vinyls from the rating system)
   - AI-generated backstory (2-3 paragraphs about the song's history)
3. Card shows "No info yet — Analyze?" button if data hasn't been fetched

### Song Story Card

```
┌─────────────────────────────────────────────┐
│  ┌────────┐                                  │
│  │ cover  │  "Superstition"                  │
│  │  art   │  Stevie Wonder                   │
│  └────────┘  Talking Book (1972)             │
│                                              │
│  ★★★★★  (your rating)                       │
│                                              │
│  ── Credits ──────────────────────────────   │
│  Written by      Stevie Wonder               │
│  Produced by     Stevie Wonder               │
│  Label           Tamla (Motown)              │
│                                              │
│  ── Charts ───────────────────────────────   │
│  #1 Billboard Hot 100 (1973)                 │
│  #1 R&B Singles                              │
│  Grammy: Best Rhythm & Blues Song            │
│                                              │
│  ── Story ────────────────────────────────   │
│  "Superstition" was born during sessions     │
│  at Electric Lady Studios. Jeff Beck was     │
│  originally supposed to record it, but       │
│  Motown insisted Stevie release it first.    │
│  The iconic clavinet riff was played on a    │
│  Hohner Clavinet C, run through a wah        │
│  pedal...                                    │
│                                              │
│  ── Cover Info ───────────────────────────   │
│  (not a cover — this is the original)        │
│                                              │
│  Covered by: Stevie Ray Vaughan (1984),      │
│  Beck, Bogert & Appice (1973)                │
└─────────────────────────────────────────────┘
```

### Data Sources

| Source | What It Provides | How |
|---|---|---|
| **MusicBrainz** | Writer, producer, label, release date, recordings | Free API, rate-limited (1 req/sec) |
| **Wikidata** | Chart positions, awards, certifications | Free SPARQL API |
| **Wikipedia** | Song backstory, trivia | Free API |
| **LLM (Claude)** | Generated backstory combining all known facts | API call per track |
| **Discogs** | Producer, label, format details | API (OAuth) |

**Strategy**: Fetch structured data from MusicBrainz/Wikidata first, then use the LLM to synthesize a readable backstory from the facts. Cache everything in the database.

### Enrichment Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│ MusicBrainz  │────▶│   Wikidata   │────▶│  LLM Story   │────▶│  Cache   │
│  (credits)   │     │  (charts)    │     │ (backstory)  │     │  (DB)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────┘
  writer, producer     #1 in 5 countries    "This song was        track_intel
  label, year          Grammy winner         written when..."      table
```

Can run on-demand (click → fetch) or batch (analyze whole library).

## Data Model

```sql
CREATE TABLE IF NOT EXISTS track_intel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,

  -- Credits
  writers TEXT,             -- JSON array: ["Stevie Wonder"]
  composers TEXT,           -- JSON array (if different from writers)
  producers TEXT,           -- JSON array: ["Stevie Wonder"]
  label TEXT,               -- "Tamla (Motown)"
  release_date TEXT,        -- original release date

  -- Cover info
  is_cover INTEGER DEFAULT 0,
  original_artist TEXT,     -- if cover: who did the original
  original_year INTEGER,    -- if cover: when was the original released
  original_title TEXT,      -- if cover: original title (if different)
  covered_by TEXT,          -- JSON array of notable covers of this song

  -- Charts & awards
  chart_positions TEXT,     -- JSON: [{ chart: "Billboard Hot 100", peak: 1, year: 1973 }]
  certifications TEXT,      -- JSON: [{ type: "Grammy", name: "Best R&B Song", year: 1974 }]

  -- Story
  backstory TEXT,           -- AI-generated 2-3 paragraph backstory
  backstory_source TEXT,    -- "llm" | "wikipedia" | "manual"

  -- Metadata
  musicbrainz_id TEXT,      -- MusicBrainz recording ID
  fetched_at TEXT DEFAULT (datetime('now')),
  enriched_at TEXT          -- when LLM backstory was generated
);
```

## API Endpoints

### `GET /api/tracks/[id]/intel`
Get song intelligence for a single track.
- Returns cached data if available
- Returns `{ status: "not_enriched" }` if no data yet

### `POST /api/tracks/[id]/intel/enrich`
Trigger enrichment for a single track.
- Fetches from MusicBrainz → Wikidata → LLM
- Caches result in `track_intel`
- Returns the enriched data

### `POST /api/intel/batch`
Batch-enrich tracks.
- Body: `{ trackIds?: number[] }` (or omit for all un-enriched tracks)
- Background job with progress tracking
- Respects MusicBrainz rate limit (1 req/sec)

### `GET /api/intel/analytics`
Aggregated analytics for the Stats page.
- Top songwriters by track count in library
- Top producers by track count
- Cover chains (original → covers)
- Writer-artist networks

## UI Integration Points

### Track Info Button
- Album detail page: info icon per track row (or click track title)
- Library page: context menu → "Song Story"
- Now Playing / Player bar: info button
- Stats page: click any track → story card

### Song Story Card
- Modal/sheet that slides up from bottom (mobile-friendly)
- Sections: Credits, Charts, Story, Cover Info
- "Analyze" button if not yet enriched
- Rating integration (show/edit golden vinyls)

### Stats → Analytics Tab
New tab in the Stats page: **"Analytics"**

Sections:
- **Top Songwriters**: Writers ranked by how many tracks they wrote in your library
  - e.g., "Max Martin — 12 tracks (Backstreet Boys, Britney, Taylor Swift)"
- **Top Producers**: Same for producers
- **Cover Network**: Visual showing original songs and their covers in your library
- **Most Covered Songs**: Songs that appear as covers most often
- **Era Distribution**: How many songs from each decade
- **Label Distribution**: Which labels appear most in your collection

## Phases

### Phase 1: On-Demand Song Stories
- Click track → fetch from MusicBrainz + LLM backstory
- Song Story card with credits, charts, story
- Cache in `track_intel` table
- "No info yet — Analyze?" state

### Phase 2: Batch Enrichment
- "Analyze All Tracks" button in Settings
- Background job with progress tracking
- Respects API rate limits
- Coverage stats (X of Y tracks enriched)

### Phase 3: Analytics Tab
- Stats page gets new "Analytics" tab
- Songwriter/producer rankings
- Cover chains and networks
- Era/label distribution charts

### Phase 4: Visual Networks
- Interactive graph visualization of songwriter → artist connections
- Click a writer → see all artists they wrote for
- Click an artist → see all writers who contributed
- Cover song family trees

## Dependencies

- MusicBrainz API (free, 1 req/sec rate limit)
- Claude API for backstory generation
- Optional: Wikidata SPARQL for charts/awards
- Optional: Discogs API for additional credits

## Open Questions

- Batch enrichment: process all tracks or only ones with play count > 0?
- LLM backstory quality: should we use a specific prompt template or let it freestyle?
- How to handle tracks with no MusicBrainz match (obscure/independent music)?
- Should enrichment happen automatically on import or only on-demand?
