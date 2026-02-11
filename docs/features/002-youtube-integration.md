# Feature: YouTube Integration

**Status:** Planned
**Priority:** Medium
**Label:** Core Feature
**Created:** 2026-02-11

## Summary

Download YouTube videos/audio, extract transcripts, and run Fabric AI analysis for knowledge extraction. Extends Vynl from a music-only platform into a personal media & insights hub.

## Problem

Valuable educational content (conference talks, tutorials, podcasts, interviews) lives on YouTube with no way to:
- Save it locally for offline access
- Extract and search transcripts
- Run AI analysis to extract key insights
- Organize it alongside other media

## Solution

### Core Flow

1. User pastes a YouTube URL or searches via the YouTube API
2. Vynl downloads audio (default) or video via `yt-dlp`
3. Transcript is extracted: YouTube auto-subs (preferred) or Whisper fallback
4. Optional: Fabric AI extracts wisdom, summaries, key takeaways
5. Content is browsable/searchable in the YouTube section

### Download Strategy

| Mode | Size (1hr) | Use Case |
|---|---|---|
| Audio only + subs | ~30MB | Talks, podcasts, interviews |
| Audio + video (720p) | ~300MB | Tutorials, visual content |
| Audio + video (1080p) | ~500MB | High-quality reference |

**Default: audio-only + subtitles** to keep NAS storage reasonable.

### Data Model

```sql
CREATE TABLE youtube_videos (
  id INTEGER PRIMARY KEY,
  videoId TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  channel TEXT,
  duration INTEGER,
  thumbnailUrl TEXT,
  downloadedAt TEXT,
  filePath TEXT,
  audioPath TEXT,
  transcriptPath TEXT,
  format TEXT DEFAULT 'audio',
  fileSize INTEGER,
  tags TEXT, -- JSON array
  fabricAnalysis TEXT, -- JSON: summary, wisdom, key points
  createdAt TEXT DEFAULT (datetime('now'))
);
```

### Fabric AI Pipeline

Same as podcasts:
1. Transcript (YouTube subs or Whisper)
2. Fabric patterns: `extract_wisdom`, `summarize`, `extract_insights`
3. Results stored in `fabricAnalysis` JSON column
4. Searchable via full-text search

### UI

- YouTube page in sidebar (toggle via feature flag - already built)
- URL input + "Download" button
- Grid/list view of downloaded videos
- Transcript viewer with search
- AI insights panel per video
- Playlist/channel batch download

## Technical Dependencies

- `yt-dlp` — YouTube download (pip install)
- YouTube Data API v3 — search, metadata (API key already in settings)
- `whisper` — fallback transcription (already used for podcasts)
- Fabric AI — analysis pipeline (already used for podcasts)

## Feature Flag

Already wired: `features.youtube` in settings store (default: off).
Sidebar item ready: `/youtube` route with YouTube icon.

## Open Questions

- [ ] Playlist support: download entire playlists?
- [ ] Channel subscriptions: auto-download new videos?
- [ ] Storage limits: warn when NAS usage is high?
- [ ] Video playback: embed player or audio-only UI?
