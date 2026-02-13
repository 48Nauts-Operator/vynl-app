# Feature: AI Music Generation (Studio Mode)

**Status:** Experimental / Planned
**Priority:** Low (future)
**Label:** Experimental
**Created:** 2026-02-11

## Summary

Use AI music generation models to compose original songs from text prompts. Write a description of the song you want — mood, genre, lyrics, instruments — and the AI creates it. Generated tracks are added to the Vynl library like any other song.

## Problem

Creating original music traditionally requires instruments, recording equipment, and production skills. AI music generation models can now produce full songs from text descriptions, opening up music creation to anyone.

## Solution

### Core Flow

1. User opens **Studio** page
2. Writes a song prompt: "A chill lo-fi hip-hop beat with jazz piano and rain sounds, 90 BPM"
3. Optionally provides:
   - Lyrics (text → sung vocals)
   - Reference track (style transfer — "make it sound like this")
   - Genre / mood / tempo constraints
4. AI generates the track (takes 30s-2min depending on model)
5. User previews the result
6. "Add to Library" saves it as a local track with metadata auto-filled

### Generation Models (Options)

| Model | Strengths | How to Use |
|---|---|---|
| **Suno** | Full songs with vocals from text prompts | API (paid) |
| **Udio** | High-quality production, good vocals | API (paid) |
| **MusicGen (Meta)** | Open-source, instrumental only, runs locally | Python / `audiocraft` |
| **Stable Audio** | Good quality, commercial license available | API or local |
| **Bark (Suno)** | Voice + music, open-source | Python, runs locally |

**Recommended start**: MusicGen for local/free instrumental generation, Suno API for full songs with vocals.

### Data Model

```sql
CREATE TABLE IF NOT EXISTS generated_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,           -- "musicgen" | "suno" | "udio" | "stable_audio"
  style TEXT,                    -- genre/mood tags
  lyrics TEXT,                   -- optional lyrics input
  duration_seconds INTEGER,
  output_path TEXT,              -- path to generated audio file
  track_id INTEGER REFERENCES tracks(id),  -- linked library track once added
  status TEXT NOT NULL DEFAULT 'generating',  -- "generating" | "ready" | "added" | "discarded"
  created_at TEXT DEFAULT (datetime('now'))
);
```

### UI: Studio Page

- Text area for the song prompt
- Optional fields: lyrics, genre, mood, tempo, duration
- "Generate" button → shows progress/spinner
- Preview player when ready
- "Add to Library" or "Regenerate" or "Discard"
- History of generated tracks

## Phases

### Phase 1: Text-to-Instrumental (MusicGen)
- Local MusicGen model via Python backend
- Simple text prompts → instrumental tracks
- Auto-save to library with generated metadata

### Phase 2: Full Song Generation (Suno/Udio API)
- Integration with Suno or Udio API
- Lyrics input → full songs with vocals
- Multiple variations per prompt

### Phase 3: Style Transfer
- Use a reference track from the library as style input
- "Make a new song that sounds like [this track]"
- Combine with lyrics for custom covers/remixes

## Dependencies

- Python backend for MusicGen (or separate microservice)
- Suno/Udio API keys for cloud generation
- Sufficient disk space for generated audio (~5MB per minute of audio)
- GPU recommended for local MusicGen (CPU works but slow)

## Open Questions

- Local generation (free, private, slower) vs. cloud API (paid, faster, better quality)?
- How to handle copyright/licensing of AI-generated music?
- Should generated tracks be tagged differently in the library?
- Integration with the AI DJ — can it generate transition jingles or intros on-the-fly?
