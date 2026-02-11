<p align="center">
  <img src="public/logo-main.png" alt="Vynl" width="280" />
</p>

<h1 align="center">Vynl</h1>

<p align="center">
  <strong>Self-hosted music library, AI discovery & multi-room playback</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#roadmap">Roadmap</a> &bull;
  <a href="docs/CONTRIBUTING.md">Contributing</a>
</p>

---

## What is Vynl?

Vynl is a self-hosted music platform that combines library management, AI-powered discovery, podcast analysis, and multi-room Sonos playback in a single app. It runs on your local network, streams from your NAS, and keeps your music collection organized with Beets.

## Features

### Music Library

- **Beets Integration** - Auto-tag, organize, and import music from any folder
- **Batch Import** - Import entire music collections with live streaming logs, auto-retry, and source folder cleanup
- **Multi-Format Support** - MP3, FLAC, M4A, AAC, OGG, Opus, WAV, WMA, AIFF
- **Album Art** - Automatic extraction from embedded metadata, fetch from online sources, iTunes search
- **Duplicate Detection** - Find and clean duplicate tracks across formats (MP3 vs M4A)
- **Split Album Merging** - Detect and fix albums fragmented by different album artists
- **Album Rules** - Regex-based rules for automatically correcting album names during scans

### AI-Powered Discovery

- **Discovery Sessions** - Explore music by genre, mood, tempo, complexity, and era
- **Taste Profiling** - AI builds a profile from your feedback (bad/ok/amazing per track)
- **Smart Recommendations** - Claude AI generates personalized playlists based on your taste profile
- **Auto-Generated Playlists** - "Heavy Rotation" auto-updates from your listening history
- **Mood Playlists** - Generate playlists by mood: Study, Workout, Relax, Party

### Playback & Audio

- **Multi-Output** - Play through browser, system audio devices, or Sonos speakers
- **Sonos Integration** - Discover speakers, control playback, adjust volume, group rooms
- **Audio Device Switching** - Bluetooth, AirPlay, built-in speakers, monitors
- **Mobile Transcoding** - Automatic FLAC/WAV to AAC transcoding for streaming
- **Queue Management** - Build and reorder your play queue, shuffle, repeat

### Party Mode

- **Fullscreen Visualizer** - Multiple visualization modes (bars, waveform)
- **Synchronized Lyrics** - Real-time line-by-line lyrics display via LRCLIB
- **Lyrics Pipeline** - Cache, embedded metadata extraction, LRCLIB API fallback
- **Keyboard Controls** - L=lyrics, V=visualizer, F=fullscreen, Space=play/pause
- **Blurred Album Art Backdrop** - Immersive background from current track's cover

### Podcasts

- **RSS Subscriptions** - Subscribe to any podcast feed
- **Episode Management** - Stream, download, and track playback position
- **Whisper Transcription** - Speech-to-text for full episode transcripts
- **Fabric AI Analysis** - Extract summaries, key insights, and actionable wisdom
- **Insights Storage** - Searchable transcript and analysis per episode

### Playlists

- **Custom Playlists** - Create, edit, reorder, and manage playlists
- **AI Generation** - Generate playlists by mood with auto-generated cover art and names
- **Heavy Rotation** - Auto-updating playlist from tracks with 3+ plays in last 4 weeks

### Library Management

- **Browse** - Tracks, albums, and artists views with search
- **Listening Stats** - Play counts, listening hours, top tracks and albums
- **Listening History** - Full playback history with timestamps
- **Track Operations** - Rename, move between albums, download
- **Housekeeping** - Clean missing files, refresh metadata, fetch artwork

### Settings & Customization

- **Feature Toggles** - Enable/disable: Podcasts, YouTube, Party Mode, Discover, Taste Profile, Playlists
- **NAS Support** - SMB and AFP mounts (tested with Synology/COSMOS)
- **Path Remapping** - Handle mount point changes without re-importing
- **API Key Management** - Anthropic, Spotify, Replicate, YouTube

## Quick Start

```bash
# Clone
git clone git@github.com:48Nauts-Operator/vynl-app.git
cd vynl-app

# Install
npm install

# Configure
cp .env.example .env.local
# Edit .env.local with your paths and API keys

# Run
npm run dev
```

Open [http://localhost:3101](http://localhost:3101)

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `MUSIC_LIBRARY_PATH` | Path to organized music library | `/Volumes/Music/library` |
| `BEETS_DB_PATH` | Path to beets SQLite database | `/Volumes/Music/library.db` |
| `BEETS_PATH_REMAP` | Remap old paths in DB | `/Volumes/Music-1::/Volumes/Music` |
| `VYNL_HOST` | Host URL for Sonos callback | `http://192.168.74.179:3101` |
| `NEXT_PUBLIC_VYNL_HOST` | Client-side host URL | `http://192.168.74.179:3101` |
| `PODCAST_STORAGE_PATH` | Where to store podcast episodes | `/Volumes/Music/podcasts` |
| `ANTHROPIC_API_KEY` | For AI discovery & recommendations | `sk-ant-...` |
| `SPOTIFY_CLIENT_ID` | Spotify integration | |
| `SPOTIFY_CLIENT_SECRET` | Spotify integration | |

### Prerequisites

- **Node.js** 18+
- **Beets** (`pip install beets`) for auto-tagging
- **FFmpeg** for audio transcoding
- Optional: **Whisper** for podcast transcription
- Optional: **Fabric** for AI podcast analysis

### Docker

Run Vynl in a container with your music library mounted:

```bash
# Copy and edit the env file
cp .env.example .env

# Build and start
docker compose up -d
```

Configure your `.env` with your LAN IP and music path:

```env
HOST_IP=192.168.1.100
MUSIC_LIBRARY_PATH=/mnt/nas/music
ANTHROPIC_API_KEY=sk-ant-...
```

The Docker image (~200MB) includes Beets and FFmpeg. For Sonos on the same network, you may need host networking — uncomment `network_mode: host` in `docker-compose.yml`.

> **Note:** Whisper and Fabric AI for podcast transcription/analysis are not yet available in Docker. These features require a native install for now and are planned for a future Docker release.

## Architecture

```
src/
  app/                          # Next.js App Router
    api/                        # 43 API endpoints
      library/                  # Library scan, import, housekeeping
      library/import/batch/     # Batch import with live streaming
      sonos/                    # Speaker discovery & control
      podcasts/                 # RSS feeds, episodes, analysis
      ai/                       # Taste profiles & recommendations
      playlists/                # CRUD + AI generation
    (pages)/                    # UI routes
  components/
    layout/Sidebar.tsx          # Navigation (feature-flag aware)
    ui/                         # Shared components (shadcn/ui)
    party/                      # Party mode visualizer & lyrics
  store/
    player.ts                   # Zustand: playback, queue, output
    settings.ts                 # Zustand: feature flags (persisted)
  lib/
    db/                         # SQLite via better-sqlite3 + Drizzle ORM
    adapters/                   # Beets & filesystem adapters
```

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, Framer Motion |
| UI | Radix UI, Lucide Icons |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| State | Zustand (player + settings stores) |
| AI | Anthropic Claude SDK |
| Music | Beets, music-metadata, FFmpeg |
| Audio | Sonos API, Web Audio API |
| Podcasts | rss-parser, Whisper, Fabric AI |
| Lyrics | LRCLIB API + embedded LRC parsing |

## Configuration

### Beets

Vynl reads from your existing beets library. Make sure `~/.config/beets/config.yaml` is configured:

```yaml
directory: /Volumes/Music/library
library: /Volumes/Music/library.db
import:
  move: yes
  duplicate_action: skip
plugins: fetchart embedart
```

### Sonos

Set `VYNL_HOST` to your machine's network IP (not localhost) so Sonos speakers can reach back for audio streaming.

### NAS

Vynl works with network-mounted storage. The batch import checks that the NAS is mounted before starting and handles path remapping for mount point changes.

## Roadmap

See [docs/features/](docs/features/) for detailed specs.

| Feature | Status | Description |
|---|---|---|
| [LLM Import Diagnostics](docs/features/001-llm-import-diagnostics.md) | Planned | AI-powered error investigation for failed imports |
| [YouTube Integration](docs/features/002-youtube-integration.md) | Planned | Download, transcribe, and analyze YouTube content |

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the development workflow, branch naming, PR process, and auto-issue template.

## License

Private project by [48Nauts-Operator](https://github.com/48Nauts-Operator).

---

<p align="center">
  Built with Next.js, Beets, and Claude AI
</p>
