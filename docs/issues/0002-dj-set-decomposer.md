## Summary

Take a downloaded YouTube DJ set / mix / compilation → identify every track in it → optionally download each identified track at full quality → auto-create a Vynl playlist with the tracks in chronological order.

Self-hosted "1001 Tracklists + auto-download" on top of the existing toolchain.

## Why

Vynl already has every piece needed for windowed track identification:
- `yt-dlp` (v0.6.25) downloads the audio
- `ffmpeg` (in image) chunks it
- `fpcalc` (in image, from `libchromaprint-tools`) fingerprints
- AcoustID API key configured in Settings
- `spotDL` (v0.6.25) grabs identified tracks at full quality
- Playlist creation API exists

Nothing new to install — pure orchestration.

The output: a 90-minute DJ set becomes a properly-tagged playlist of the original tracks in your library. Then they're playable on Sonos, mixable in the AI DJ, etc.

## Pipeline

```
YouTube URL → yt-dlp downloads MP3
   ↓
ffmpeg segments into 30s chunks (5s stride)
   ↓
fpcalc → fingerprint each chunk
   ↓
AcoustID lookup per fingerprint  (rate-limited 3 req/sec)
   ↓
Collapse consecutive matches of the same recording into
tracklist entries with start/end timestamps + confidence
   ↓
UI: tracklist preview with confidence scores per row
   ↓
User confirms → for each identified track:
   already_local       → link to existing tracks row
   missing             → spotDL download (full quality)
   low_confidence      → push to wishlist with status="needs_review"
   ↓
Auto-create Vynl playlist named after the mix + identified
tracks in chronological order
```

## Accuracy notes

- Vanilla AcoustID on DJ mixes: ~50-70% per chunk (EQ / pitch / loops degrade match)
- Mainstream / unmodified tracks: closer to 85%
- Window: 30s with 5s stride; confidence threshold ~0.5 for inclusion
- Surface unidentified gaps as `Unknown 12:30-15:42` rows the user can manually tag
- 90-minute mix with ~25 tracks typically yields 15-18 cleanly identified

## Backend

- `POST /api/youtube/decompose` `{filePath | youtubeUrl}` → kicks off background job
- `GET  /api/youtube/decompose` → poll status + partial tracklist as chunks complete
- New table `dj_decomposed_sets`:
  ```
  id, source_url, title, duration_ms, chunked_at, completed_at,
  tracklist: JSON [{ startMs, endMs, recordingMbid, title, artist, confidence }]
  ```
- Reuse existing identify lib (`src/lib/identify.ts`) — extend with a `fingerprintChunk(filePath, startSec, lengthSec)` helper

## Frontend

- After a YouTube download completes (#84), show an extra **Decompose** button if the file is >5 min
- Decompose progress shows live tracklist building (most recent identification at top, chronological in final view)
- On done: tracklist preview with three per-row actions (Download missing / Link existing / Manual tag)
- "Create playlist from this set" button at the bottom

## Out of scope (separate issues)

- Using these decomposed sets as AI DJ training data → #86
- Manual track tagging for the unknown gaps (could be a follow-up)

## Dependencies

- #84 — YouTube downloader (entry point)

## Acceptance

- [ ] Decompose a 60-min DJ set → tracklist with timestamps generated
- [ ] At least 50% of mainstream tracks identified
- [ ] Unidentified gaps shown as "Unknown" rows the user can ignore or tag
- [ ] Per-row action: download missing track via spotDL
- [ ] "Create playlist from this set" produces a Vynl playlist with identified tracks in order
- [ ] AcoustID rate limit respected (3 req/sec); doesn't burn the user's daily quota

## Sized

~1 day (backend pipeline ~4h, UI ~3h, edge cases / retry / dedupe ~2h).
