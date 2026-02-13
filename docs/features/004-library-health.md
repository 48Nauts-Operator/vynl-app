# Library Health & AI Album Analyzer

Automated library maintenance tools that detect and fix compilation albums, merge disc-split entries, find duplicates, clean orphaned records, and use AI to analyze album groupings.

## Quick Start

1. Go to **Settings > Library Health**
2. Click **Run AI Analysis** to scan for album issues
3. Review detected groups (compilations, disc-splits, duplicates)
4. Apply fixes individually or in bulk

## Features

### AI Album Analyzer

Uses Claude (Sonnet) to intelligently analyze your library for albums that should be merged, renamed, or recategorized. The analysis runs as a background job with real-time progress.

**Three-phase pipeline:**

| Phase | What it does | Detail |
|-------|-------------|--------|
| **Scanning** | Reads all albums from the database | Groups by album name, counts distinct artists |
| **Matching** | Finds similar album groups | Disc-split detection + Levenshtein similarity |
| **AI Analyzing** | Sends groups to Claude for classification | Determines merge targets, compilation status, canonical names |

#### Disc-Split Detection

Albums split across multiple entries (e.g., `Breakdown [Disc 1]` and `Breakdown [Disc 2]`) are detected by stripping suffixes and comparing base names.

Stripped patterns:
- `[Disc N]`, `[CD N]`, `[Part N]`, `[Pt N]`
- `Vol. N`, `Volume N`
- `- Disc N`, `- CD N`
- `[Deluxe Edition]`, `[Limited Edition]`, `[Special Version]`
- `: The Soundtrack`

After stripping, albums with the same normalized base name are grouped as disc-splits.

#### Levenshtein Similarity

For albums not caught by suffix stripping, a second pass uses Levenshtein distance:
- Exact normalized match (after lowercasing, removing punctuation)
- Prefix match (one name starts with the other)
- Same artist + edit distance < 25% of name length

#### AI Classification

When an Anthropic API key is configured, detected groups are sent to Claude for analysis. The AI determines:
- Whether albums should be merged
- The canonical album name (without disc/vol suffixes)
- The album artist (`Various Artists` for compilations)
- A regex pattern matching all variants
- Whether it's a compilation

Without an API key, groups are still detected but presented without AI recommendations.

### Compilation Detection

Albums with many different track artists are flagged as compilations. Detection happens at three points:

1. **Beets import**: The beets `comp` flag (from MusicBrainz) automatically sets `album_artist = "Various Artists"`
2. **Post-scan heuristic**: After every library scan, albums with 4+ distinct artists are auto-tagged as compilations
3. **Manual fix**: Settings > Library Health > Compilations shows detected compilations for bulk fixing

#### Why compilations cause duplicates

The albums API groups by `(album, album_artist)`. When a compilation has per-track artists as `album_artist` (e.g., "DJ Snake", "Tiesto", "Armin"), each unique artist creates a separate album entry. Setting all tracks to `album_artist = "Various Artists"` collapses them into one entry.

### Housekeeping Actions

| Action | API | What it does |
|--------|-----|-------------|
| **Re-scan Library** | `POST /api/library/scan` | Full library re-scan with adapter auto-detection |
| **Fix Compilations** | `POST /api/library/housekeeping/fix-compilations` | Set album_artist to "Various Artists" for 4+ artist albums |
| **Clean Missing Files** | `POST /api/library/housekeeping/clean-missing` | Remove DB entries where the audio file no longer exists |
| **Extract Cover Art** | `POST /api/library/housekeeping/extract-covers` | Extract embedded cover art from audio files |
| **Fetch All Lyrics** | `POST /api/lyrics/batch` | Pre-fetch lyrics from LRCLIB for all tracks |

### Album Rules

Pattern-based rules that automatically rename albums during scanning. Created manually or from AI Analyzer suggestions.

| Field | Description |
|-------|-------------|
| `pattern` | Regex pattern (case-insensitive) matching album names |
| `targetAlbum` | The canonical album name to apply |
| `targetAlbumArtist` | Optional: override album artist (e.g., "Various Artists") |

Rules are applied during library scan before tracks are inserted into the database.

## Progress Indicator

The AI Analyzer shows real-time progress while running:

```
┌─────────────────────────────────────────┐
│ ● AI Analysis Running                   │
│                                         │
│ Phase: Comparing 847 albums...          │
│ ████████████████░░░░░░░░░ 65%          │
│                                         │
│ Albums: 847  |  Groups found: 12        │
└─────────────────────────────────────────┘
```

Progress is preserved across page navigations and hot-reloads using `globalThis` state persistence.

## API Reference

### `POST /api/library/housekeeping/album-analyze`

Start an AI album analysis job.

**Response:**
```json
{
  "message": "Analysis started",
  "status": "running"
}
```

Returns `409` if an analysis is already running.

### `GET /api/library/housekeeping/album-analyze`

Poll analysis job status.

**Response (running):**
```json
{
  "status": "running",
  "phase": "matching",
  "phaseDetail": "Comparing 847 albums...",
  "totalAlbums": 847,
  "groupsFound": 0,
  "suggestions": [],
  "skipped": 0
}
```

**Response (complete):**
```json
{
  "status": "complete",
  "phase": "done",
  "totalAlbums": 847,
  "groupsFound": 15,
  "suggestions": [
    {
      "albums": [
        { "name": "Breakdown [Disc 1]", "artist": "Various Artists", "trackCount": 20 },
        { "name": "Breakdown [Disc 2]", "artist": "Various Artists", "trackCount": 18 }
      ],
      "reason": "Disc-split or volume-split album",
      "type": "disc-split",
      "shouldMerge": true,
      "isCompilation": true,
      "suggestedRule": {
        "pattern": "breakdown.*",
        "targetAlbum": "Breakdown",
        "targetAlbumArtist": "Various Artists"
      },
      "explanation": "Two-disc compilation, should be merged with disc numbers"
    }
  ],
  "skipped": 3,
  "message": "AI analyzed 15 groups, 12 need cleanup"
}
```

### `GET /api/library/housekeeping/fix-compilations`

Preview detected compilations (albums with 4+ distinct artists not yet marked as "Various Artists").

```json
{
  "count": 5,
  "albums": [
    { "album": "Frantic Euphoria, Vol. 1", "distinctArtists": 51, "tracks": 54 }
  ]
}
```

### `POST /api/library/housekeeping/fix-compilations`

Apply compilation fix to all detected albums.

```json
{
  "fixed": 5,
  "tracksUpdated": 287,
  "albums": [
    { "album": "Frantic Euphoria, Vol. 1", "distinctArtists": 51, "tracks": 54 }
  ]
}
```

## File Structure

```
src/
  app/
    settings/
      page.tsx                              # Settings UI (Library Health section)
    api/
      library/
        scan/route.ts                       # Library scan with post-scan compilation detection
        housekeeping/
          album-analyze/route.ts            # AI album analyzer (background job)
          fix-compilations/route.ts         # Compilation detection & fix
          clean-missing/route.ts            # Remove orphaned DB entries
          extract-covers/route.ts           # Extract embedded cover art
  lib/
    adapters/
      beets-adapter.ts                      # Beets DB reader (comp flag support)
      filesystem-adapter.ts                 # Direct filesystem scanner
    db/
      schema.ts                             # albumRules table definition
```

## Configuration

- **Anthropic API Key**: Set `ANTHROPIC_API_KEY` in `.env.local` to enable AI analysis
- **AI Model**: Uses `claude-sonnet-4-5-20250929` for album classification
- **Compilation threshold**: 4+ distinct artists triggers automatic compilation tagging

## Limitations

- **AI analysis requires API key**: Without `ANTHROPIC_API_KEY`, groups are detected but not AI-classified
- **Heuristic threshold**: The 4-artist threshold may occasionally false-positive on split albums or box sets with guest artists
- **Album rules are regex**: Complex patterns may need manual tuning
- **Background job is in-memory**: Restarting the server loses a running analysis (but the database changes from completed fixes persist)
