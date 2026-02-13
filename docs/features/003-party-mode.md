# Party Mode (Karaoke)

Full-screen immersive music experience with time-synced lyrics, audio visualizers, and multi-room playback. Designed for karaoke sessions, parties, and ambient music display on a big screen via AirPlay.

## Quick Start

1. Start playing a track (from Library, Albums, or a Playlist)
2. Click **Party Mode** in the sidebar or on the home page
3. Lyrics appear automatically — press `F` for fullscreen
4. AirPlay the browser window to your TV for karaoke

## Features

### Time-Synced Lyrics

Lyrics scroll in real-time, line by line, matching the music. The active line is highlighted large and centered, with past and upcoming lines faded.

- **Active line**: 4xl bold white text with purple glow
- **Past lines**: 25% opacity, slightly scaled down
- **Future lines**: 40% opacity, slightly scaled down
- **Instrumental sections**: Shown as `- - -`
- **Gradient masks** at top/bottom for smooth visual fade

Synced lyrics use the [LRC format](https://en.wikipedia.org/wiki/LRC_(file_format)) — timestamps embedded in the text like `[01:23.45] Lyrics here`. The parser uses binary search for efficient real-time line tracking.

### Plain Lyrics Fallback

When synced lyrics aren't available but plain text is, the display auto-scrolls based on playback progress (estimated position through the song).

### Audio Visualizer

Four visualizer modes cycle through or display alongside lyrics:

| Mode | Description |
|------|-------------|
| **Bars** | 64 frequency bars with dynamic colors and reflections |
| **Wave** | 3 layered sine waves modulated by audio frequency |
| **Circles** | 32 dots in a radial pattern, pulsing with the beat |
| **Particles** | Up to 300 particles spawning from center with gravity |

The visualizer connects directly to the browser's Web Audio API (`AnalyserNode`, FFT size 256) for real-time frequency data. It supports HiDPI displays.

> **Note:** The visualizer only works in **browser playback** mode. When playing through Sonos, the audio stream goes directly to the speaker, so the browser doesn't have frequency data. In Sonos mode, the visualizer shows a gentle idle animation.

### View Modes

| Mode | Layout | Best For |
|------|--------|----------|
| **Split** (default) | Visualizer (40%) + Lyrics (60%) | Karaoke + ambience |
| **Lyrics** | Full-screen lyrics only | Karaoke / sing-along |
| **Visualizer** | Full-screen visualizer + floating album art | Ambient / party |

The mode auto-switches: if no lyrics are found, it defaults to visualizer-only.

### Keyboard Controls

| Key | Action |
|-----|--------|
| `L` | Toggle lyrics view (lyrics-only ↔ split) |
| `V` | Toggle visualizer view (visualizer-only ↔ split) |
| `F` | Toggle fullscreen |
| `Space` | Play / Pause |
| `←` | Previous track |
| `→` | Next track |

Controls auto-hide after 3 seconds of no mouse movement.

### Album Art Backdrop

The current track's album art is used as a blurred, dimmed background (scale 110%, blur, 20% opacity) behind the lyrics and visualizer for an immersive feel.

## Lyrics Pipeline

Lyrics are sourced through a three-stage waterfall. Once found, they're cached in the database for instant retrieval on replay.

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  1. Cache    │────▶│ 2. Embedded Tags │────▶│  3. LRCLIB   │
│  (SQLite)   │     │  (music-metadata)│     │   (API)      │
└─────────────┘     └──────────────────┘     └─────────────┘
     hit?                 hit?                    hit?
      │                    │                       │
      ▼                    ▼                       ▼
   Return              Cache + Return         Cache + Return
```

### Stage 1: Database Cache

The `track_lyrics` table stores previously fetched lyrics:

| Column | Type | Description |
|--------|------|-------------|
| `track_id` | INTEGER | Foreign key to tracks table |
| `content` | TEXT | The lyrics text (LRC or plain) |
| `format` | TEXT | `"lrc"` (synced) or `"plain"` |
| `source` | TEXT | `"embedded"`, `"lrclib"`, or `"manual"` |
| `fetched_at` | TEXT | When the lyrics were cached |

### Stage 2: Embedded Metadata

Reads lyrics directly from the audio file's tags using `music-metadata`:
- ID3v2 `USLT` frame (Unsynchronized Lyrics)
- Vorbis `LYRICS` tag
- Auto-detects LRC format via timestamp regex

### Stage 3: LRCLIB API

[LRCLIB](https://lrclib.net) is a free, open lyrics database. Vynl queries it by artist, title, album, and duration:

```
GET https://lrclib.net/api/get?artist_name=...&track_name=...&album_name=...&duration=...
```

Returns both synced (`syncedLyrics`) and plain (`plainLyrics`) versions when available. Synced lyrics are preferred.

### Smooth Scrolling for Sonos

When playing through Sonos, position updates come every ~2 seconds (the Sonos polling interval). To keep lyrics scrolling smoothly, the display uses `requestAnimationFrame` to interpolate time between polls:

```
actual_display_time = last_known_time + (now - last_update_time)
```

This creates buttery smooth scrolling even with infrequent position updates.

## Bulk Lyrics Download

**API:** `POST /api/lyrics/batch`

Pre-fetches lyrics for your entire library (or a subset) so they're cached and ready for Party Mode. This runs as a background job.

**Usage:** Settings > Library Health > **Fetch All Lyrics**

The batch fetcher:
1. Queries all tracks that don't yet have cached lyrics
2. For each track, runs the lyrics pipeline (embedded → LRCLIB)
3. Caches results in the `track_lyrics` table
4. Reports progress: found/not-found/total
5. Respects LRCLIB rate limits (100ms delay between requests)

## Streaming to a TV

### AirPlay (Recommended)

Party Mode is designed for big-screen display via AirPlay:

1. Open Party Mode in **Safari** (AirPlay works best in Safari)
2. Press `F` to go fullscreen
3. Use **macOS Screen Mirroring** (Control Center > Screen Mirroring) to mirror to your Apple TV or AirPlay-compatible smart TV
4. The fullscreen lyrics + visualizer display on the TV

**Audio routing options:**
- **Browser audio → AirPlay speaker**: Use macOS audio output switching (built into Vynl's speaker selection)
- **Sonos speakers**: Play audio through Sonos while mirroring the visual display to the TV — audio comes from Sonos, visuals from AirPlay
- **TV audio**: AirPlay mirrors both video and audio to the TV

### Sonos + TV Display (Best for parties)

For the best karaoke setup:
1. Play music through **Sonos speakers** (better audio quality, multi-room)
2. AirPlay **just the screen** to the TV (Screen Mirroring, not audio)
3. Lyrics display on TV, audio from Sonos — no sync issues because the lyrics track the Sonos position

### Chromecast / HDMI

- Connect your Mac to a TV via **HDMI** and use the TV as an extended display
- Open Party Mode in fullscreen on the TV display
- Audio can go through the TV, a connected speaker, or Sonos

## API Reference

### `GET /api/lyrics`

Fetch lyrics for a single track.

| Parameter | Type | Description |
|-----------|------|-------------|
| `trackId` | number | Track ID from database |
| `artist` | string | Artist name |
| `title` | string | Track title |
| `album` | string | Album name (optional, improves LRCLIB matching) |
| `filePath` | string | Path to audio file (for embedded lyrics) |
| `duration` | number | Track duration in seconds (improves LRCLIB matching) |

**Response:**
```json
{
  "content": "[00:12.50] First line...\n[00:15.30] Second line...",
  "format": "lrc",
  "source": "lrclib",
  "lines": [
    { "time": 12.5, "text": "First line..." },
    { "time": 15.3, "text": "Second line..." }
  ]
}
```

### `POST /api/lyrics/batch`

Bulk-fetch lyrics for all tracks missing cached lyrics.

**Response (while running):**
```json
{
  "status": "running",
  "total": 1500,
  "processed": 342,
  "found": 280,
  "notFound": 62,
  "errors": 0
}
```

### `GET /api/lyrics/stats`

Get lyrics coverage statistics for the library.

```json
{
  "totalTracks": 1500,
  "withLyrics": 820,
  "syncedLyrics": 650,
  "plainLyrics": 170,
  "coverage": "54.7%"
}
```

## File Structure

```
src/
  app/
    party/
      page.tsx              # Main Party Mode UI
      layout.tsx            # Passthrough layout
    api/
      lyrics/
        route.ts            # Single-track lyrics API
        batch/route.ts      # Bulk lyrics download
        stats/route.ts      # Coverage statistics
  components/
    party/
      LyricsDisplay.tsx     # Synced + plain lyrics rendering
      PartyVisualizer.tsx   # 4 visualizer modes (canvas)
  hooks/
    useLyrics.ts            # React hook for lyrics state
  lib/
    lyrics.ts               # LRC parser, LRCLIB client, cache
  lib/db/
    schema.ts               # track_lyrics table definition
```

## Configuration

Party Mode can be toggled in **Settings > Features**:
- Feature flag key: `partyMode`
- When disabled, the sidebar link and home page button are hidden
- The `/party` route still works if accessed directly

## Limitations

- **Visualizer requires browser playback**: When using Sonos, audio goes directly to the speaker — the browser has no frequency data for the visualizer
- **LRCLIB coverage varies**: Popular songs have excellent coverage; obscure tracks may only have plain lyrics or none
- **LRC timing depends on the source**: Some LRC files have per-word timing, others per-line. Vynl uses per-line display
- **AirPlay latency**: Screen mirroring adds ~50-200ms visual delay. When using Sonos audio + AirPlay display, this is usually not noticeable for lyrics
