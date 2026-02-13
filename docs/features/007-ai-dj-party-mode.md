# Feature: AI DJ Party Mode

**Status:** Phase 1 Shipped
**Priority:** High
**Label:** Core Feature
**Created:** 2026-02-11

## Summary

An LLM-powered DJ that builds and plays smart, contextual playlists from your library. Define the vibe — age group, mood, duration, genre — and the AI DJ curates a set that flows like a real DJ would: building energy, reading the room, mixing genres intelligently, and transitioning smoothly.

## Current State

The original "Party Mode" (lyrics + visualizer) has been renamed to **Karaoke Mode** and lives at `/karaoke` with a dedicated split-screen layout (track queue on left, lyrics on right). The old `/party` route still exists with the visualizer-focused layout.

The AI DJ will be a **separate future feature** that replaces or extends the `/party` route when built.

| Mode | What It Does | Route | Status |
|------|-------------|-------|--------|
| **Karaoke Mode** | Track queue + time-synced lyrics (split layout) | `/karaoke` | Shipped |
| **Party Mode (legacy)** | Visualizer + lyrics (original layout) | `/party` | Shipped |
| **AI DJ** | LLM-curated playlist with smart sequencing | `/party` | Phase 1 Shipped |

## Problem

Building a great party playlist is an art:
- You need to match the audience (age group → era of music)
- Energy needs to flow (build up, peak, cool down, repeat)
- Song transitions matter (key, tempo, genre compatibility)
- You don't want repeats or jarring genre jumps
- Doing this manually for a 4-hour party is tedious

## Solution

### Core Flow

1. User opens Party Mode → sees the **DJ Setup** screen
2. Defines the party:
   - **Audience**: Age group(s) — e.g., "40-60" → AI focuses on 70s-90s music
   - **Vibe**: Chill, Dance, Mixed, High Energy
   - **Duration**: 1h, 2h, 3h, 4h, or "Until I stop it"
   - **Genre preferences**: Optional — "No country", "Lots of funk", etc.
   - **Occasion**: House party, Dinner, BBQ, Workout, Late night
3. AI analyzes the full library catalog and builds a sequenced set
4. Playback begins — tracks play in DJ-curated order
5. Between tracks: optional AI "DJ drops" (text overlay: "Coming up next...", or generated voice in Phase 2)

### Party Setup Screen

```
┌─────────────────────────────────────────────┐
│           🎧  AI DJ Setup                    │
│                                              │
│  Who's at the party?                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │  20-30s  │ │  40-50s  │ │  60+     │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│                                              │
│  What's the vibe?                            │
│  ┌──────┐ ┌───────┐ ┌──────┐ ┌─────────┐   │
│  │ Chill│ │ Mixed │ │ Dance│ │ High NRG│   │
│  └──────┘ └───────┘ └──────┘ └─────────┘   │
│                                              │
│  How long?                                   │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌──────────┐  │
│  │ 1h │ │ 2h │ │ 3h │ │ 4h │ │ Non-stop │  │
│  └────┘ └────┘ └────┘ └────┘ └──────────┘  │
│                                              │
│  Any special requests? (optional)            │
│  ┌──────────────────────────────────────┐   │
│  │ "Lots of Motown, no heavy metal"    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│         [ 🎧 Start the Party ]               │
└─────────────────────────────────────────────┘
```

### AI Set Building

When the user hits "Start the Party", the backend:

1. **Exports library catalog** — all tracks with metadata: title, artist, album, genre, year, BPM, duration, play count, rating
2. **Sends to LLM** with a carefully structured prompt:
   - Party parameters (audience, vibe, duration)
   - Full track list as structured data
   - Instructions for sequencing: energy curve, genre transitions, era matching
3. **LLM returns** an ordered list of track IDs with optional annotations:
   ```json
   {
     "setList": [
       { "trackId": 142, "note": "Opening — mellow groove to set the mood" },
       { "trackId": 891, "note": "Building energy" },
       { "trackId": 2041, "note": "Peak moment — crowd favorite" }
     ],
     "djNotes": "This set flows from smooth soul into funk, builds to disco peak..."
   }
   ```
4. **Set is loaded into the player queue** and playback begins

### Playback Experience

During playback, the Party Mode screen shows:
- Current track with large album art
- "Up next" preview (next 3-5 tracks)
- DJ's note for the current track ("Building energy...")
- Progress bar for the overall set (e.g., "Track 12 of 45 — 1h 23m remaining")
- Visualizer in the background (reuse from Karaoke Mode)
- Controls: Skip, Pause, "Remove this track", "I love this" (feeds back to ratings)

### Smart Sequencing Rules

The LLM prompt instructs the AI to follow DJ best practices:
- **Energy curve**: Start medium → build → peak → cooldown → build again
- **Era matching**: For a 50-60 age group, weight heavily toward 70s-90s music
- **Genre transitions**: Don't jump from jazz to death metal — bridge genres
- **Tempo flow**: Gradual BPM changes (±15 BPM between tracks)
- **No back-to-back same artist** (unless it's a deliberate mini-set)
- **Key compatibility**: Prefer harmonically compatible transitions (Camelot wheel)
- **Duration target**: Hit the requested duration within ±5 minutes

## LLM Requirements

### What LLM Can Handle This?

**A general-purpose LLM like Claude is sufficient.** Here's why:

| Capability | Why Claude Works |
|---|---|
| Music era knowledge | Knows which artists/genres belong to which decades |
| Cultural context | Understands what a "50-60 age group house party" implies musically |
| Sequencing logic | Can follow DJ rules (energy curves, genre transitions) |
| Structured output | Returns ordered track lists as JSON |

**What Claude needs from us:**
- Rich metadata per track (the more context, the better the curation)
- A well-crafted system prompt with DJ best practices
- The full library catalog in structured format

### Metadata Enrichment (Pre-requisite)

For best results, tracks should have:

| Field | Source | Priority |
|---|---|---|
| Genre | Beets tags / MusicBrainz | Essential |
| Year | Beets tags | Essential |
| BPM | Audio analysis (`essentia` / `librosa`) | High |
| Energy | Audio analysis | Medium |
| Key | Audio analysis | Medium (for harmonic mixing) |
| Mood tags | LLM inference from genre + era | Nice to have |

**Phase 0**: Run a one-time audio analysis pass on the library to extract BPM, energy, and key. Store in a new `track_audio_features` table.

### Token Budget

A library of ~2000 tracks with metadata is roughly:
- ~100 tokens per track (title, artist, album, genre, year, BPM, duration)
- ~200K tokens for 2000 tracks
- This fits in Claude's context window (200K)
- For larger libraries: chunk by genre/era, or pre-filter based on party params

## Data Model

```sql
-- Audio features extracted by analysis
CREATE TABLE IF NOT EXISTS track_audio_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
  bpm REAL,
  energy REAL,          -- 0.0-1.0
  key TEXT,             -- e.g., "C major", "A minor"
  camelot TEXT,         -- e.g., "8B", "5A"
  danceability REAL,    -- 0.0-1.0
  analyzed_at TEXT DEFAULT (datetime('now'))
);

-- DJ sessions
CREATE TABLE IF NOT EXISTS dj_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience TEXT,        -- JSON: age groups selected
  vibe TEXT NOT NULL,   -- "chill" | "mixed" | "dance" | "high_energy"
  duration_minutes INTEGER,
  occasion TEXT,        -- "house_party" | "dinner" | "bbq" | "workout" | "late_night"
  special_requests TEXT,
  dj_notes TEXT,        -- LLM-generated set description
  track_count INTEGER,
  status TEXT NOT NULL DEFAULT 'active',  -- "active" | "completed" | "cancelled"
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tracks in a DJ session (ordered)
CREATE TABLE IF NOT EXISTS dj_session_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES dj_sessions(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  dj_note TEXT,         -- AI annotation for this track in the set
  played INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0
);
```

## Phases

### Phase 1: Core AI DJ
- Party setup screen with audience/vibe/duration pickers
- LLM builds set from library catalog + metadata
- Playback with "Up next" preview and DJ notes
- Basic crossfade between tracks (Web Audio API, 3-5 second overlap)

### Phase 2: Audio Analysis
- Batch BPM/key/energy extraction using `essentia` or `librosa`
- `track_audio_features` table
- LLM uses audio features for smarter sequencing (tempo flow, harmonic mixing)

### Phase 3: DJ Voice & Visualization
- **DJ Intro**: Session opens with a TTS-generated spoken intro
  - "This is DJ [OwnerName], and tonight I'm going to play for you..."
  - LLM writes the intro script based on party params (audience, vibe, occasion)
  - TTS generates audio (ElevenLabs for quality, or local Kokoro for speed)
  - Plays before first track with fade-in to music
- **DJ Drops between tracks**: Short spoken transitions ("Coming up next...", "Let's turn it up...")
- Animated DJ avatar or turntable visualization
- Beat-synced visual effects
- "Now playing" / "Up next" overlays styled like a real DJ booth

### Phase 3b: Mobile Support
- Responsive layout for the DJ setup screen (works on phone)
- Mobile-friendly playback controls
- Create session on phone → plays on phone or casts to speakers (Sonos/AirPlay)
- PWA support for home screen access

### Phase 4: Live Feedback
- "More like this" / "Skip" buttons during playback
- AI adjusts the remaining set based on live feedback
- Learning over time: which tracks get skipped vs. loved at parties

## UI Integration Points

### Sidebar Navigation
- Karaoke Mode already in sidebar at `/karaoke` (icon: `MicVocal`)
- AI DJ will get its own nav entry when built (icon: `Headphones` or custom DJ icon)

### URL Routes
- `/karaoke` — lyrics + queue split-screen (shipped)
- `/party` — legacy visualizer + lyrics (stays for now, AI DJ replaces it later)

## Dependencies

- Claude API (or similar LLM) for set building
- Audio analysis library for Phase 2 (`essentia` / `librosa` via Python, or `meyda` for JS)
- Web Audio API for crossfades (already partially used in Karaoke visualizer)

## Commercial Opportunity: Standalone AI DJ Product

If the AI DJ proves it can build sets that genuinely rival human DJs, this becomes a **licensable standalone product**.

### The Idea

- **"Vynl DJ"** — a separate product/edition built on the same core
- Users load their own music library (just like Vynl)
- Configure the party parameters → AI builds and plays a professional set
- Target audience: venues, bars, restaurants, event organizers, hobby DJs
- Subscription or one-time license model

### Why This Could Work

- Human DJs charge $500-5000+ per event
- Many venues just need "good music that flows well" — not a celebrity DJ
- Restaurants/bars play Spotify playlists today with zero curation
- An AI that understands energy flow, audience demographics, and transitions is a real value prop

### Architecture for Standalone

The AI DJ module should be built as a **separable layer**:

```
┌─────────────────────────────────────────┐
│  Vynl (full app)                         │
│  ┌────────────────────────────────────┐  │
│  │  AI DJ Module (separable)          │  │
│  │  - Library analyzer                │  │
│  │  - LLM set builder                │  │
│  │  - Crossfade engine               │  │
│  │  - DJ voice (TTS)                 │  │
│  │  - Playback controller            │  │
│  └────────────────────────────────────┘  │
│  Karaoke, Wish List, Stats, etc.         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Vynl DJ (standalone)                    │
│  ┌────────────────────────────────────┐  │
│  │  AI DJ Module (same core)          │  │
│  └────────────────────────────────────┘  │
│  Minimal UI: library import + DJ setup   │
└─────────────────────────────────────────┘
```

Build the AI DJ as a self-contained module from day one, so it can be extracted into a standalone product without rewriting.

### Licensing Audit

All current dependencies are commercially safe:

| Dependency | License | Commercial Use |
|---|---|---|
| Beets | MIT | Yes, fully permissible |
| Next.js | MIT | Yes |
| Drizzle ORM | Apache 2.0 | Yes |
| better-sqlite3 | MIT | Yes |
| Claude API | Anthropic commercial terms | Yes (pay per use) |
| Web Audio API | Browser native | N/A |
| essentia / librosa | AGPL / ISC | AGPL for essentia — **needs attention**. May need to use `meyda` (MIT) or `librosa` (ISC) instead for commercial |

**Key risk**: `essentia` is AGPL — if used in a commercial product, it would require open-sourcing the entire product unless used via a network API boundary. **Alternatives**: `librosa` (ISC, Python), `meyda` (MIT, JavaScript), or run essentia as a separate microservice (API boundary satisfies AGPL).

### Monetization Models

| Model | Description |
|---|---|
| **SaaS subscription** | Monthly fee for AI DJ access, LLM costs included |
| **One-time license** | Pay once for the standalone app, user provides own LLM API key |
| **Freemium** | Basic sets free (limited duration/features), premium for full DJ |
| **Per-event** | Pay per DJ session generated (micro-transaction) |

### Next Steps for Commercialization

1. Build the AI DJ in Vynl first (prove the concept)
2. Keep the DJ module architecturally separate
3. Avoid AGPL dependencies in the DJ module (use MIT/ISC alternatives)
4. Test with real parties — does the AI actually make good sets?
5. If validated: extract into standalone "Vynl DJ" product

## Open Questions

- Should the DJ be able to pull from external sources (YouTube, Spotify previews) or strictly local library?
- How to handle small libraries where the AI doesn't have enough tracks for a genre?
- Should previous DJ sessions influence future ones (learning)?
- Voice DJ drops: TTS (ElevenLabs?) or text-only overlays?
- Commercial: per-use pricing vs. subscription vs. one-time license?
- Patent potential for the LLM-powered DJ set generation approach?
