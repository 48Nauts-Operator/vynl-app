<p align="center">
  <img src="public/logo-main.png" alt="Vynl" width="280" />
</p>

<h1 align="center">Vynl</h1>

<p align="center">
  <strong>Self-hosted music library, AI cleanup & multi-room playback</strong>
</p>

<p align="center">
  <a href="#whats-new-in-v06x">What's New</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#quick-start-docker">Docker</a> &bull;
  <a href="#quick-start-native--development">Native</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#roadmap">Roadmap</a> &bull;
  <a href="docs/CONTRIBUTING.md">Contributing</a>
</p>

---

## What is Vynl?

Vynl is a self-hosted music platform that combines library management, AI-powered cleanup, podcast analysis, and multi-room Sonos playback in a single app. It runs on your local network, streams from your NAS, and keeps your music collection organised with Beets — only smarter, because Vynl knows how to read the library and orchestrate beets for you.

---

## What's New in v0.6.x

The v0.6 line is where Vynl grew up. The headline additions:

### 🩺 BeetsAI Doctor — full-library cleanup with an AI second opinion

One button scans your whole library for four classes of metadata problems, applies the obvious fixes automatically, and queues anything uncertain for a one-click review. Every action is logged for audit and reversible.

**What it looks for**

- **Compilations** — albums with many distinct track artists that aren't flagged as Various Artists. The classic "Ibiza Uncovered shows up as 60 separate one-track albums" problem, fixed in one pass.
- **Disc splits** — multi-disc albums stored as `[Disc 1]` / `[Disc 2]` siblings that should be merged into one entry.
- **Junk entries** — orphan rows with broken metadata: blank album names, URLs stored as album names, single-track stubs under `__/` or `_/NNN/` paths. Removed from the beets DB only — your audio files on disk are never touched.
- **Wrong / missing genres** — empty genre tags or ones that clearly don't fit. LLM proposes the right one based on artist + album context.

**Three-layer atomic apply** — every fix updates the beets DB, then `beet write` pushes the change to your file tags, then Vynl's own tracks table syncs immediately so the UI reflects the change without waiting for a metadata refresh.

**Plan mode** — recommended for the first run. Detects + judges candidates but writes nothing; everything queues for review so you can eyeball what Doctor wants to do before approving.

**Per-job log files** under `/app/logs/<timestamp>_beets-doctor_<jobid>.log` so the full scan history is available beyond the 500-line UI buffer. `tail -f logs/current.log` from the host once you mount the volume.

**Provider-agnostic** — works with Anthropic Claude (most reliable), OpenRouter, local LM Studio, or Ollama. Reasoning models like qwen3 and gemma-with-thinking are supported (token budget extended to 2000 to give them room to think and emit the JSON answer).

### 🎶 Album types — Compilations, Singles, Albums

A new `is_compilation` flag flows from the iTunes TCMP tag (or Doctor's fix) into Vynl's DB, driving a fast filter and visual badges.

- **On-Air toggle row** next to the genre filter — three neon pill buttons (Albums / Compilations / Singles), all lit by default, multi-select, persisted across navigation.
- **VA badge** in the top-left of every compilation tile (and inline in list view).
- **Album detail page** says "Compilation" or "Single" instead of always "Album".

### 👑 5-Vynl Crown + All-Time Songs

Rate any track 5 Vynls and a faint purple Vynl reveals itself next to the rating. Click it to crown the track:

- The golden Vynls swap to purple in place.
- A full-screen celebration drops: a Vynl-DJ logo bops above a CSS turntable; the platter spins with a vinyl that has a purple VYNL-stamped label; the tonearm swings down; pink LEDs strobe along the deck; the song title glows with neon purple/pink.
- The track auto-lands in the **All-Time Songs** playlist (created on first crown, renameable).

All-Time Songs gets pinned to the top of the Playlists overview as its own section with a row of six glowing Vynl icons. Toggle the animation off in Settings → "5-Vynl Celebration" — the playlist behaviour stays.

### 🔊 Sonos overhaul

- **In-process discovery** via `@svrooij/sonos`. No external `sonos` CLI dependency in the image.
- **Speaker-style UI** with EQ-bar visualisation, transport controls, volume slider per speaker, party-mode grouping.
- **Cross-fade** between tracks via the DJ playback hook.
- **Important deploy note:** if you open Vynl over a remote tunnel (Tailscale, Wireguard), set `NEXT_PUBLIC_VYNL_HOST` to your NAS LAN IP. Sonos speakers fetch the audio file from whatever URL Vynl hands them, and they can't reach Tailscale hostnames — only the LAN.

### 🗂️ Playlist sections + AI generation

- Playlists overview groups by user-defined sections (Sport, Xmas, Party, etc.). The reserved "All Time" section is always pinned at the top.
- AI Generate produces a playlist by mood, with an auto-generated cover (Replicate) and an LLM-named title. Cover generation runs in the background so the playlist is usable immediately.

### 🧭 Sidebar restructure

The nav grew enough to need sections. Top-level stays flat for content (Home, Albums, Artists, Playlists, Podcasts), and three collapsible groups handle the rest: **Discovery** (Discover, Wishlist, Taste Profile, YouTube), **Party** (AI DJ, Karaoke), **Admin & Housekeeping** (Library, Speakers, Stats, Settings, About). Per-section open/closed state persists.

---

## Features

### Music Library

- **Beets Integration** — Auto-tag, organise, and import music from any folder
- **Batch Import** — Import entire collections with live streaming logs, auto-retry, and source folder cleanup
- **Multi-Format Support** — MP3, FLAC, M4A, AAC, OGG, Opus, WAV, WMA, AIFF
- **Album Art** — Embedded metadata extraction, MusicBrainz / Last.fm / iTunes lookup, manual upload
- **BeetsAI Doctor** — Full-library compilation / disc-split / junk / genre cleanup with LLM judgement (see [What's New](#-beetsai-doctor--full-library-cleanup-with-an-ai-second-opinion))
- **Album Rules** — Regex-based rules for automatically correcting album names during scans

### AI Discovery

- **Discovery Sessions** — Explore music by genre, mood, tempo, complexity, era
- **Taste Profiling** — AI builds a profile from your bad/ok/amazing feedback
- **Smart Recommendations** — Claude AI suggests new music aligned with your profile
- **Mood Playlists** — AI Generate playlist by mood (Study, Workout, Relax, Party) with auto-generated cover art

### Playback & Audio

- **Multi-Output** — Browser, system audio devices, or Sonos speakers
- **Sonos Integration** — In-process discovery, transport control, volume, grouping, cross-fade
- **FFmpeg Transcoding** — Lossless formats (FLAC/WAV/AIFF) transcoded to MP3 on-the-fly for Sonos
- **Queue Management** — Build/reorder, shuffle, repeat, history

### Party & Karaoke

- **Party Mode** — Fullscreen visualiser, synchronised lyrics (LRCLIB), blurred-album-art backdrop, keyboard shortcuts
- **AI DJ** — Crossfaded sets with an AI host; dynamic queue based on vibe and audience
- **Karaoke Mode** — Split-screen queue + time-synced lyrics

### Ratings & Stats

- **Track Ratings** — Rate 1–5 with golden Vynl icons; 5-Vynl Crown triggers the celebration + All-Time Songs auto-playlist
- **Album Ratings** — Computed average of track ratings
- **Stats Dashboard** — Best albums, most played tracks, listening hours; every row links to its album page
- **Worst Tracks** — Find and archive low-rated tracks

### Podcasts

- **RSS Subscriptions** — Subscribe to any podcast feed
- **Episode Management** — Stream, download, track playback position
- **Whisper Transcription** — Speech-to-text for full episode transcripts (native install)
- **Fabric AI Analysis** — Summaries, key insights, actionable wisdom (native install)

### Spotify Integration

- **Library Extract** — Import playlists, liked songs, and audio features
- **Smart Matching** — ISRC + fuzzy artist/title matching against your local library
- **Playlist Mirroring** — Matched Spotify playlists become Vynl playlists
- **Wishlist** — Unmatched tracks land in a wishlist with duplicate detection

### Playlists

- **Custom Playlists** — Create, edit, reorder, manage
- **Sections** — User-defined grouping (Sport, Xmas, etc.); "All Time" auto-pinned at top with a six-Vynl decoration
- **AI Generation** — Mood-based with background cover art generation
- **Heavy Rotation** — Auto-updating from your last 4 weeks of plays
- **Grid & List Views** — Toggle between card grid and sortable table

### Settings & Customization

- **Feature Toggles** — Per-feature enable/disable (Podcasts, YouTube, Party Mode, Discover, Taste Profile, Playlists)
- **5-Vynl Celebration** toggle — disable the crown animation while keeping the All-Time Songs behaviour
- **NAS Support** — SMB / AFP mounts; tested on Synology and UGREEN UGOS Pro (`cosmos`)
- **Path Remapping** — Handle mount-point changes without re-importing
- **LLM Provider** — Anthropic, OpenRouter, Ollama, LM Studio. Per-provider model selection.
- **Flight Check** — Settings page panel that verifies your environment (beets binary, FFmpeg, paths, LLM reachable, etc.)

---

## Quick Start (Docker)

Pre-built images on GitHub Container Registry for **amd64** and **arm64**:

```bash
docker pull ghcr.io/48nauts-operator/vynl-app:latest
```

### Docker Compose

```bash
git clone https://github.com/48Nauts-Operator/vynl-app.git
cd vynl-app
cp .env.example .env
# Edit .env with your LAN IP and music path
docker compose up -d
```

Open `http://<YOUR_IP>:3101`.

### Portainer / Stack Deployment

Use the image `ghcr.io/48nauts-operator/vynl-app:latest` and configure:

| Variable | Required | Example |
|---|---|---|
| `NEXT_PUBLIC_VYNL_HOST` | Yes (for Sonos) | `http://192.168.1.100:3101` (LAN IP, **not** Tailscale) |
| `MUSIC_LIBRARY_PATH` | Yes | `/mnt/nas/music` |
| `ANTHROPIC_API_KEY` | Optional | `sk-ant-...` |
| `SPOTIFY_CLIENT_ID` | Optional | |
| `SPOTIFY_CLIENT_SECRET` | Optional | |
| `REPLICATE_API_TOKEN` | Optional (AI cover art) | `r8_...` |

Mount these volumes:

| Container Path | Purpose |
|---|---|
| `/music` | Music library + beets DB |
| `/app/data` | Persistent app data (named volume) |
| `/app/public/covers` | Cover art cache (named volume) |
| `/app/logs` | Doctor scan log files (optional bind mount) |

### Docker Notes

- Image (~200 MB) bundles Beets and FFmpeg.
- For Sonos discovery and audio streaming, use **host networking** (`network_mode: host` in compose). SSDP multicast doesn't traverse bridge networks.
- Images are rebuilt and published on every push to `main`.
- Whisper / Fabric for podcast transcription are not yet in the Docker image — planned.

---

## Quick Start (Native / Development)

```bash
git clone https://github.com/48Nauts-Operator/vynl-app.git
cd vynl-app
npm install
cp .env.example .env.local
# Edit .env.local with your paths and API keys
npm run dev
```

Open [http://localhost:3101](http://localhost:3101).

### Prerequisites

- **Node.js** 18+
- **Beets** (`pip install beets`) — auto-tagging + BeetsAI Doctor backend
- **FFmpeg** — required for FLAC/WAV/AIFF playback on Sonos
- Optional: **Whisper** for podcast transcription
- Optional: **Fabric** for AI podcast analysis

### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `MUSIC_LIBRARY_PATH` | Path to organised music library | `/Volumes/Music/library` |
| `BEETS_DB_PATH` | Path to beets SQLite database | `/Volumes/Music/library.db` |
| `BEETS_PATH_REMAP` | Remap old paths in DB | `/Volumes/Music-1::/Volumes/Music` |
| `NEXT_PUBLIC_VYNL_HOST` | LAN host URL Sonos can reach | `http://192.168.1.100:3101` |
| `PODCAST_STORAGE_PATH` | Where to store podcast episodes | `/Volumes/Music/podcasts` |
| `ANTHROPIC_API_KEY` | AI Discovery + Doctor LLM | `sk-ant-...` |
| `REPLICATE_API_TOKEN` | AI cover art (Flux) | `r8_...` |
| `SPOTIFY_CLIENT_ID` | Spotify integration | |
| `SPOTIFY_CLIENT_SECRET` | Spotify integration | |
| `SPOTIFY_REDIRECT_URI` | Spotify OAuth callback | `http://127.0.0.1:3101/api/spotify/callback` |
| `SONOS_SEED_IP` | Optional Sonos discovery fallback when SSDP is blocked | `192.168.1.42` |
| `GH_STATS_PAT` | Optional GitHub PAT for `/github-stats` | `github_pat_…` |

## Architecture

```
src/
  app/                          # Next.js App Router
    api/                        # 50+ API endpoints
      library/                  # Library scan, import, housekeeping, doctor runner
      beetsai/                  # Doctor review queue + audit log
      sonos/                    # Speaker discovery & control
      podcasts/                 # RSS, episodes, analysis
      playlists/                # CRUD + AI generation
    (pages)/                    # UI routes (Sidebar-grouped: content / Discovery / Party / Admin & Housekeeping)
  components/
    layout/Sidebar.tsx          # Collapsible nav sections
    library/DoctorTab.tsx       # BeetsAI Doctor UI
    ui/FiveStarCelebration.tsx  # 5-Vynl crown overlay
    party/                      # Party mode visualiser & lyrics
  store/
    player.ts                   # Zustand: playback, queue, output
    settings.ts                 # Zustand: feature flags + UI prefs (persisted)
  lib/
    beets-doctor/               # detect.ts, prompts.ts, apply.ts (3-layer atomic apply)
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
| AI | Anthropic Claude SDK, OpenAI-compatible (LM Studio / OpenRouter / Ollama), Replicate (Flux) |
| Music | Beets, music-metadata, FFmpeg |
| Audio | `@svrooij/sonos`, Web Audio API |
| Podcasts | rss-parser, Whisper, Fabric AI |
| Lyrics | LRCLIB API + embedded LRC parsing |

## Configuration

### Beets

Vynl reads from your existing beets library:

```yaml
directory: /Volumes/Music/library
library: /Volumes/Music/library.db
import:
  move: yes
  duplicate_action: skip
plugins: fetchart embedart lastgenre mbsync replaygain
paths:
  default:   $albumartist/$album%aunique{}/$track $title
  comp:      Compilations/$album%aunique{}/$track $title
  singleton: Non-Album/$artist/$title
```

The `comp:` path template is what lets BeetsAI Doctor's compilation fix actually *move* Various-Artists releases out of the per-artist tree once you run `beet move`.

### Sonos

Set `NEXT_PUBLIC_VYNL_HOST` to your machine's **LAN** IP (not a Tailscale or remote tunnel hostname) so Sonos speakers can reach back for audio streaming. Symptom of the wrong host: `UPnPError 701 (Transition not available)` in the container logs.

### NAS

Vynl works with network-mounted storage. Tested on Synology DSM and UGREEN UGOS Pro. The batch import checks that the NAS is mounted before starting and handles path remapping for mount-point changes.

## Roadmap

See [docs/features/](docs/features/) for detailed specs.

| Feature | Status | Description |
|---|---|---|
| [Spotify Library Extract](docs/features/012-spotify-library-extract.md) | Done | OAuth, extraction, matching, wishlist |
| [Party Mode](docs/features/003-party-mode.md) | Done | Visualiser, lyrics, fullscreen |
| [Album Browsing](docs/features/005-album-browsing.md) | Done | Grid/list views, ratings, cover art |
| [Wish List](docs/features/006-wish-list.md) | Done | Spotify missing tracks, dedup, filters |
| BeetsAI Doctor | Done (v0.6.x) | Full-library AI cleanup, plan mode, audit log |
| Album type filter | Done (v0.6.x) | Compilations / Singles / Albums + VA badge |
| 5-Vynl Crown | Done (v0.6.x) | Celebration animation + All-Time Songs auto-playlist |
| Doctor script-first redesign | Planned (v0.7.0) | Rule-based detection per category, opt-in LLM, collapsible cards |
| In-app release notifications | Planned (v0.7.x) | Bell icon when a new GHCR image is available |
| AI cover-art generation (per playlist) | Planned (v0.7.x) | One-click generate from playlist name + description |
| Podcast AI Discovery | Planned (v0.7.x) | Topic search → curated + web-found podcasts with one-click subscribe |
| [AI DJ Party Mode](docs/features/007-ai-dj-party-mode.md) | In Progress | AI-powered DJ with crossfading |
| [LLM Import Diagnostics](docs/features/001-llm-import-diagnostics.md) | Planned | AI-powered error investigation for failed imports |
| [YouTube Integration](docs/features/002-youtube-integration.md) | Planned | Download, transcribe, and analyse YouTube content |
| [AI Music Generation](docs/features/008-ai-music-generation.md) | Planned | Generate original music with AI |
| [Usenet Integration](docs/features/009-usenet-integration.md) | Planned | NZB download automation |
| [Song Recognition](docs/features/010-song-recognition.md) | Planned | Shazam-like audio fingerprinting |
| [Song Stories](docs/features/011-song-stories.md) | Planned | AI-generated backstories for tracks |

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for the development workflow, branch naming, PR process, and auto-issue template.

For per-release detail see the [Releases](https://github.com/48Nauts-Operator/vynl-app/releases) page — every push to `main` ships notes auto-generated from conventional commits.

## License

Private project by [48Nauts-Operator](https://github.com/48Nauts-Operator).

---

<p align="center">
  Built with Next.js, Beets, and Claude AI
</p>
