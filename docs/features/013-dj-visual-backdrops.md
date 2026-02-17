# Feature: AI DJ Visual Backdrops (Veo 3)

**Status:** Planned
**Priority:** Medium
**Label:** DJ / Visual
**Created:** 2026-02-13
**Depends on:** 007 (AI DJ Party Mode)

## Summary

Generate AI video backdrops for DJ playback using Google's Veo 3. Each energy phase of a DJ set gets a custom-generated video loop that plays as the background on the DJPlaybackScreen. Visuals are generated automatically when a DJ set is created and cached for reuse across sessions with the same vibe.

## Problem

The current DJ playback screen uses a static blurred album art backdrop. While functional, it doesn't create the immersive visual experience you'd see at a real DJ set — festival-quality visuals, mood-matched lighting, energy-appropriate animations. A TV displaying the DJ screen during a party should feel like a visual experience, not a music player.

## Solution

### Core Concept

Map the existing DJ energy phase system to AI-generated video loops:

| Phase | % of Set | Visual Direction |
|-------|----------|-----------------|
| Opening | 0-10% | Slow sunrise, calm particles, warm golden drift |
| Warming Up | 10-25% | Abstract flowing light trails gaining momentum |
| Building Energy | 25-40% | Neon geometric patterns accelerating, pulsing grids |
| Peak Time | 40-55% | Intense strobes, explosive particle systems, festival energy |
| Breather | 55-65% | Bioluminescent underwater, ethereal slow motion |
| Second Peak | 65-80% | Speed and light, rocket through neon clouds |
| Winding Down | 80-90% | City lights from above, gentle camera drift |
| Grand Finale | 90-100% | Fireworks, golden confetti, celebration |

The visual direction is further shaped by the session's **vibe**:

| Vibe | Visual Modifier |
|------|----------------|
| Chill | Dreamy, ocean, slow-motion nature, soft focus |
| Dance | Club lights, crowd energy, strobes, neon |
| Mixed | Urban landscapes, abstract art, diverse moods |
| High Energy | Hard strobes, laser grids, fast cuts, rave footage |

### Generation Flow

```
DJ Set Generated (/api/dj/generate)
      |
      v
Background Job: POST /api/dj/visuals/generate
      |
      +-- Check cache: does vibe + phase combo already exist?
      |     YES --> skip generation, link existing clip
      |     NO  --> continue
      |
      +-- Build prompt: phase direction + vibe modifier
      |
      +-- Send to Veo 3 (Google AI Studio)
      |     - 8-second clip per phase
      |     - 720p landscape (16:9)
      |     - Seamless loop preferred (prompt-guided)
      |
      +-- Save to /Volumes/Music/dj-visuals/{vibe}/{phase}.mp4
      |
      +-- Update vynl-studio.db with metadata
      |
      v
DJPlaybackScreen: <video> layer replaces blurred album art
      - Loops current phase's clip
      - Crossfade on phase transitions (CSS opacity transition)
      - Falls back to blurred album art if no visual available
```

### Smart Caching

A "Dance / Peak Time" video works for any dance set — generate once, reuse forever. The cache key is `{vibe}:{phase}`.

With 4 vibes and 8 phases = **32 total clips** to cover all combinations. Once generated, no further API calls needed.

Users can also regenerate specific clips if they want variety (button in settings).

## Secondary Database: vynl-studio.db

DJ visual data lives in a separate SQLite database from the music library. This keeps the beets/music DB clean and makes the AI/creative layer independently portable.

**Location:** `/Volumes/Music/vynl-studio.db`
**Env var:** `VYNL_STUDIO_DB_PATH`

### Why a Separate DB?

- **Music DB stays clean** — beets owns its schema, no AI clutter
- **Different lifecycle** — studio data is regenerable, music data is precious
- **Backup cadence** — music DB: daily backup; studio DB: optional (can regenerate)
- **VynlDJ extraction** — if DJ becomes a standalone product, this DB travels with it
- **Future expansion** — YouTube style profiles, DJ learning data, visual libraries

### Schema

```sql
-- Visual backdrop clips
CREATE TABLE IF NOT EXISTS dj_visual_backdrops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vibe TEXT NOT NULL,              -- "chill" | "dance" | "mixed" | "high_energy"
  phase TEXT NOT NULL,             -- "opening" | "warming_up" | "building" | "peak" | etc.
  prompt TEXT NOT NULL,            -- Full Veo 3 prompt used
  video_path TEXT,                 -- Local path to .mp4 file
  duration_seconds REAL,           -- Clip length
  width INTEGER,                   -- Resolution width
  height INTEGER,                  -- Resolution height
  file_size_bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',  -- "pending" | "generating" | "ready" | "failed"
  error TEXT,                      -- Error message if failed
  generation_id TEXT,              -- Veo 3 job ID for polling
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(vibe, phase)              -- One clip per vibe+phase combo
);

-- Generation job tracking
CREATE TABLE IF NOT EXISTS dj_visual_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,              -- DJ session that triggered this (nullable for manual)
  total_clips INTEGER NOT NULL,
  completed_clips INTEGER DEFAULT 0,
  failed_clips INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- "pending" | "running" | "completed" | "failed"
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Prompt templates per phase (customizable)
CREATE TABLE IF NOT EXISTS dj_visual_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase TEXT NOT NULL,
  vibe TEXT,                       -- NULL = default for all vibes
  prompt_template TEXT NOT NULL,   -- Template with {vibe} placeholder
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Future: YouTube-learned DJ style profiles
CREATE TABLE IF NOT EXISTS dj_style_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,              -- "Boiler Room House Set", "Carl Cox Ibiza"
  source_url TEXT,                 -- YouTube URL if learned from video
  energy_curve TEXT,               -- JSON: position -> energy mapping
  bpm_range_low REAL,
  bpm_range_high REAL,
  genre_distribution TEXT,         -- JSON: genre -> percentage
  transition_style TEXT,           -- "smooth" | "hard_cut" | "blend"
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Drizzle Schema (TypeScript)

The studio DB gets its own Drizzle schema file and connection:

```
src/lib/db/
  index.ts          -- existing music DB connection
  schema.ts         -- existing music schema
  studio.ts         -- NEW: studio DB connection
  studio-schema.ts  -- NEW: studio Drizzle schema
```

## API Routes

### POST /api/dj/visuals/generate

Triggered automatically after DJ set generation, or manually from settings.

**Request body:**
```json
{
  "sessionId": 42,
  "vibes": ["dance"],
  "phases": ["opening", "warming_up", "building", "peak", "breather", "second_peak", "winding_down", "finale"],
  "forceRegenerate": false
}
```

**Response:**
```json
{
  "jobId": 7,
  "totalClips": 8,
  "cached": 5,
  "generating": 3
}
```

### GET /api/dj/visuals/status/:jobId

Poll for generation progress.

```json
{
  "jobId": 7,
  "status": "running",
  "completed": 2,
  "failed": 0,
  "total": 3
}
```

### GET /api/dj/visuals/:vibe/:phase

Returns the video file path (or 404 if not yet generated).

```json
{
  "videoUrl": "/dj-visuals/dance/peak.mp4",
  "status": "ready",
  "duration": 8.0
}
```

### DELETE /api/dj/visuals/:vibe/:phase

Deletes a cached clip (for regeneration).

## Veo 3 Integration

### API Access: Google AI Studio

```typescript
// src/lib/veo3.ts
// [VynlDJ] — extractable: Veo 3 video generation client

const VEO3_API_URL = "https://generativelanguage.googleapis.com/v1beta";

interface Veo3GenerateRequest {
  prompt: string;
  aspectRatio: "16:9";
  durationSeconds: 8;
  numberOfVideos: 1;
}

interface Veo3GenerateResponse {
  name: string;  // Operation ID for polling
}

interface Veo3PollResponse {
  done: boolean;
  response?: {
    generatedVideos: Array<{
      video: { uri: string };
    }>;
  };
}
```

### Prompt Construction

```typescript
function buildVisualPrompt(phase: string, vibe: string): string {
  const phaseDirections: Record<string, string> = {
    opening: "Slow, cinematic establishing shot. Gentle movement, warm tones, sunrise quality light. Calm and inviting atmosphere.",
    warming_up: "Abstract flowing light trails gaining momentum. Colors transitioning from warm to vibrant. Gradually increasing motion.",
    building: "Accelerating neon geometric patterns. Pulsing grid lines and expanding shapes. Rising energy, anticipation building.",
    peak: "Explosive visual energy. Rapid light bursts, intense strobes, particles exploding outward. Maximum intensity and movement.",
    breather: "Ethereal slow motion. Underwater bioluminescence, floating particles. Cool blues and purples. Peaceful deceleration.",
    second_peak: "Dynamic speed and light. Rockets through neon clouds, hyperspace tunnels. Re-energized and powerful.",
    winding_down: "City lights from above at night. Gentle camera drift. Stars appearing. Reflective, beautiful calm.",
    finale: "Celebratory finale. Fireworks, golden confetti, light show crescendo. Triumphant and satisfying conclusion.",
  };

  const vibeModifiers: Record<string, string> = {
    chill: "Dreamy and relaxed. Ocean waves, soft bokeh, nature in slow motion. Muted pastel palette.",
    dance: "Club and festival aesthetic. Neon colors, laser beams, LED walls, crowd silhouettes. Electric and vibrant.",
    mixed: "Urban and eclectic. Cityscapes, abstract digital art, diverse visual textures. Sophisticated and varied.",
    high_energy: "Rave intensity. Hard strobes, aggressive laser patterns, fast cuts, industrial textures. Raw and powerful.",
  };

  const direction = phaseDirections[phase] || phaseDirections.opening;
  const modifier = vibeModifiers[vibe] || vibeModifiers.mixed;

  return `Seamless looping background video for a music DJ set. No text, no people, no faces. Abstract and atmospheric. ${direction} ${modifier} Cinematic quality, 4K aesthetic, smooth continuous motion. Perfect for looping.`;
}
```

### Cost Estimate

- Veo 3 via AI Studio: pricing TBD (currently in preview/limited access)
- 32 clips (4 vibes x 8 phases) = one-time generation cost
- Each clip: ~8 seconds at 720p
- Regeneration: only when user explicitly requests

## UI Changes

### DJPlaybackScreen — Video Layer

Replace the blurred album art backdrop with a video element:

```tsx
// In DJPlaybackScreen.tsx, replace the blurred backdrop section:

{/* Video backdrop — falls back to blurred album art */}
{currentVisualUrl ? (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <video
      key={currentVisualUrl}
      src={currentVisualUrl}
      autoPlay
      loop
      muted
      playsInline
      className="w-full h-full object-cover opacity-30"
    />
    <div className="absolute inset-0 bg-black/50" />
  </div>
) : currentTrack?.coverPath ? (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <Image ... blurred album art (existing) ... />
  </div>
) : null}
```

Phase transitions use a CSS crossfade: mount both old and new videos, transition opacity over 2 seconds.

### Settings Page — Visual Management

Under DJ settings, add a section:

```
DJ Visual Backdrops
──────────────────
Status: 24 of 32 clips generated

[Generate Missing]  [Regenerate All]

Preview:
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Chill  │ │ Dance  │ │ Mixed  │ │ Hi NRG │
│ 8/8    │ │ 8/8    │ │ 8/8    │ │ 0/8    │
└────────┘ └────────┘ └────────┘ └────────┘
```

## File Structure

```
src/lib/
  db/
    studio.ts              -- Studio DB connection (new)
    studio-schema.ts       -- Drizzle schema for vynl-studio.db (new)
  veo3.ts                  -- Veo 3 API client (new)
  visual-prompts.ts        -- Prompt templates per phase/vibe (new)

src/app/api/dj/visuals/
  generate/route.ts        -- POST: trigger visual generation
  status/[jobId]/route.ts  -- GET: poll generation progress
  [vibe]/[phase]/route.ts  -- GET/DELETE: individual clip management

src/components/dj/
  DJPlaybackScreen.tsx     -- Add video backdrop layer
  DJVisualSettings.tsx     -- Settings UI for managing visual clips (new)
```

## Phases

### Phase 1: Foundation
- Create `vynl-studio.db` with Drizzle schema and connection
- Veo 3 API client (`src/lib/veo3.ts`)
- Prompt templates for all 8 phases x 4 vibes
- Generation API route with background job
- Storage in `/Volumes/Music/dj-visuals/`

### Phase 2: Playback Integration
- Video backdrop layer in DJPlaybackScreen
- Phase-aware video switching with crossfade
- Fallback to blurred album art when no visual exists
- Auto-trigger generation on DJ set creation

### Phase 3: Management UI
- Visual management section in Settings
- Preview thumbnails for generated clips
- Regenerate individual clips
- Storage usage display

### Phase 4: Advanced (Future)
- Custom prompt editing per phase
- User-uploaded video clips as alternatives
- Beat-synced visual effects (analyzing BPM to pulse opacity/scale)
- Multiple visual variants per phase (random selection)
- YouTube-learned visual style profiles (ties into DJ style intelligence)

## Environment Variables

```env
# Google AI Studio
GOOGLE_AI_STUDIO_API_KEY=           # Required for Veo 3
# Studio database
VYNL_STUDIO_DB_PATH=/Volumes/Music/vynl-studio.db
# Visual storage
DJ_VISUALS_PATH=/Volumes/Music/dj-visuals
```

## Dependencies

| Package | License | Purpose |
|---------|---------|---------|
| `@google/generative-ai` | Apache 2.0 | Google AI Studio SDK (if available for Veo 3) |
| None additional | — | May use raw fetch to Veo 3 REST API |

No AGPL dependencies. All commercially safe per VynlDJ extraction guidelines.

## Open Questions

- Veo 3 API availability: currently in preview — need to confirm access via AI Studio vs. Vertex AI
- Seamless looping: can Veo 3 generate videos that loop cleanly, or do we need post-processing (ffmpeg crossfade on last/first frames)?
- Resolution: 720p sufficient for TV display, or should we go 1080p? (cost/storage trade-off)
- Audio-reactive visuals: Phase 4 could modulate video opacity/scale to the beat — worth the complexity?
- Clip length: 8 seconds is short. Should we generate 15-30 second clips for more variety in the loop?
