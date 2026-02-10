# Tunify — Project Handover Document

> AI-powered music library with Beets integration, album browsing, Sonos playback & remote streaming.
> **Repo:** `git@github.com:48Nauts-Operator/tunify.git`
> **Last updated:** 2026-02-10

---

## Quick Start (New Machine)

```bash
git clone git@github.com:48Nauts-Operator/tunify.git
cd tunify
npm install

# Create .env.local (see Environment section below)
# Install Beets (optional, for library management)
pipx install beets  # or: pip install beets
pip install requests pylast python3-discogs-client

npm run dev
# → http://localhost:3101
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.3.2 (App Router) |
| React | 19.0.0 |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| UI | Radix UI + shadcn/ui (new-york style) |
| Styling | Tailwind CSS v4 (dark theme, Spotify-inspired) |
| State | Zustand 5 |
| Animations | Framer Motion 12 |
| AI | Anthropic Claude SDK (taste profiling, recommendations, playlist generation) |
| Audio metadata | music-metadata 11 |
| Music management | Beets (Python CLI, reads library.db directly) |
| Playback | HTML5 Audio (browser) + Sonos CLI (`/opt/homebrew/bin/sonos`) |
| Port | 3101 (configured in package.json dev script) |

---

## Environment Variables (`.env.local`)

This file is gitignored. Create it at the project root:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-api03-...
MUSIC_LIBRARY_PATH=/Users/zelda/Music
TUNIFY_HOST=http://localhost:3101

# Spotify (for discovery sampling via Sonos search)
SPOTIFY_CLIENT_ID=98c86d4adcd24eae962cd09ac1389f89
SPOTIFY_CLIENT_SECRET=d227f47644ea48efb66bc1e2aeb7fc28

# Optional
REPLICATE_API_TOKEN=
YOUTUBE_API_KEY=

# API Authentication (leave empty to disable)
# Remote requests (non-localhost) require this key as Bearer token
TUNIFY_API_KEY=
```

---

## Beets Configuration (`~/.config/beets/config.yaml`)

This lives outside the repo. Create on each machine:

```yaml
directory: /Users/zelda/Music
library: ~/.config/beets/library.db
import:
  move: yes
  autotag: yes
  duplicate_action: skip
  group_albums: yes
paths:
  default: $albumartist/$album%aunique{}/$track $title
  singleton: Non-Album/$artist/$title
  comp: Compilations/$album%aunique{}/$track $title
plugins: fetchart embedart discogs
fetchart:
  auto: yes
  cautious: yes
embedart:
  auto: yes
  maxwidth: 1000
```

> **Note:** Update `directory` to match `MUSIC_LIBRARY_PATH` on each machine.

---

## Project Architecture

```
src/
├── app/                              # Next.js App Router pages + API
│   ├── page.tsx                      # Dashboard (stats, recent activity)
│   ├── layout.tsx                    # Root layout (AppShell + PlayerBar)
│   ├── library/page.tsx              # Library: Browse | Import | Duplicates | Housekeeping
│   ├── albums/
│   │   ├── page.tsx                  # Album grid (sort, genre filter)
│   │   └── [id]/page.tsx             # Album detail (hero, tracklist, play all/shuffle)
│   ├── artists/
│   │   ├── page.tsx                  # Artist grid with search
│   │   └── [name]/page.tsx           # Artist detail (albums list)
│   ├── discover/page.tsx             # AI discovery: genres → sample → rate → profile
│   ├── playlists/page.tsx            # Playlist CRUD + AI generation
│   ├── profile/page.tsx              # Taste profile display
│   ├── speakers/page.tsx             # Sonos speaker management
│   ├── settings/page.tsx             # Settings
│   └── api/
│       ├── audio/[...path]/route.ts  # Audio streaming (range requests + mobile transcoding)
│       ├── library/
│       │   ├── route.ts              # GET tracks (search, paginate)
│       │   ├── scan/route.ts         # POST scan (auto-detect beets/filesystem adapter)
│       │   ├── search/route.ts       # Unified search (local + Spotify + radio)
│       │   ├── history/route.ts      # Listening history
│       │   ├── import/route.ts       # POST beet import
│       │   ├── duplicates/route.ts   # GET analysis, DELETE remove
│       │   └── housekeeping/route.ts # POST clean-missing/refresh-metadata/fetch-artwork
│       ├── albums/
│       │   ├── route.ts              # GET album list (grouped, sorted)
│       │   └── [id]/route.ts         # GET album detail + tracklist
│       ├── download/route.ts         # POST single/multi track download
│       ├── discover/                 # Session, samples, feedback
│       ├── ai/                       # Profile generation, recommendations
│       ├── playlists/                # CRUD + AI generate
│       └── sonos/                    # Speakers, status, control, volume, group
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # Nav: Home, Library, Albums, Artists, Discover, etc.
│   │   └── AppShell.tsx              # Sidebar + main content wrapper
│   ├── player/PlayerBar.tsx          # Bottom player controls
│   ├── library/UnifiedSearch.tsx     # Search component
│   └── ui/                          # shadcn/ui components (button, card, tabs, select, etc.)
│
├── hooks/
│   ├── useAudioPlayer.ts            # HTML5 Audio + Sonos playback, history recording
│   └── useKeyboardShortcuts.ts      # Keyboard nav
│
├── lib/
│   ├── db/
│   │   ├── schema.ts                # Drizzle schema (8 tables)
│   │   └── index.ts                 # DB init + table creation
│   ├── adapters/
│   │   ├── types.ts                 # ScannedTrack + MusicSourceAdapter interfaces
│   │   ├── filesystem-adapter.ts    # Walks dirs, reads music-metadata
│   │   └── beets-adapter.ts         # Reads beets library.db directly
│   ├── duplicates.ts                # Duplicate detection + removal
│   ├── auth.ts                      # API key auth helper
│   ├── ai.ts                        # Claude API (profiles, recommendations, playlists)
│   ├── sonos.ts                     # Sonos CLI wrapper
│   └── utils.ts                     # cn(), formatDuration(), formatFileSize()
│
├── store/player.ts                  # Zustand: queue, playback, volume, output target
└── middleware.ts                    # API auth enforcement (localhost bypass)
```

---

## Database Schema (SQLite — `tunify.db`)

Auto-created on first run. 8 tables:

| Table | Purpose |
|---|---|
| `tracks` | Music library (title, artist, album, file_path, duration, format, bitrate, cover_path, play_count) |
| `playlists` | User + AI-generated playlists |
| `playlist_tracks` | Many-to-many junction (playlist ↔ track, with position) |
| `listening_history` | Play tracking (track, source, duration listened, output target) |
| `discovery_sessions` | Discovery flow state (genres, mood, tempo, era, status) |
| `taste_feedback` | Rating data per session (bad/ok/amazing) |
| `taste_profile` | AI-generated taste profiles (text, genre distribution, top artists) |
| `settings` | Key-value config store |

The `tracks` table has a unique constraint on `file_path`. Scans use upsert (insert or update on conflict).

---

## Key Features & How They Work

### Library Scanning (Multi-Adapter)
- `POST /api/library/scan?adapter=beets|filesystem`
- Default: auto-detects Beets if `~/.config/beets/library.db` exists
- **Beets adapter**: reads the `items` table directly via better-sqlite3 (fast, no shell exec)
- **Filesystem adapter**: walks `MUSIC_LIBRARY_PATH`, extracts metadata via music-metadata
- Both extract cover art → saved to `public/covers/` with MD5-hashed filenames

### Beets Import
- `POST /api/library/import` with `{ path: "/path/to/folder" }`
- Runs `beet import -q <path>` via execFile
- After import, auto-triggers library re-scan

### Duplicate Detection
- `GET /api/library/duplicates` — groups by `lower(artist)|lower(album)|lower(title)`
- Quality ranking: FLAC(5) > ALAC(4) > M4A(3) > OGG(2) > MP3(1) > WMA(0)
- `DELETE /api/library/duplicates?dryRun=false` — removes lower-quality copies (file + DB)

### Housekeeping
- `POST /api/library/housekeeping` with `{ action }`:
  - `clean-missing` — removes DB entries where files no longer exist
  - `refresh-metadata` — re-reads tags from files via music-metadata
  - `fetch-artwork` — runs `beet fetchart -q`

### Album Browsing
- Albums page: grid view, sort by artist/name/year/recent, filter by genre
- Album IDs encoded as `albumArtist---album` in URLs
- Album detail: hero cover, metadata, ordered tracklist with disc separators

### Audio Streaming & Transcoding
- `GET /api/audio/[...path]` — serves audio files with HTTP 206 range requests
- `?quality=mobile` — transcodes FLAC/WAV/AIFF → AAC 256kbps via FFmpeg
- `?download=true` — adds Content-Disposition attachment header
- Requires FFmpeg installed for transcoding (`brew install ffmpeg`)

### Playback
- **Browser**: HTML5 Audio element (managed by `useAudioPlayer` hook)
- **Sonos**: CLI wrapper at `/opt/homebrew/bin/sonos` (play URI, volume, grouping)
- Output target toggled in player store (Zustand)
- Listening history recorded after 30s of playback

### AI Features (Claude)
- **Taste Profile**: rates sample tracks → Claude generates profile text + genre distribution
- **Recommendations**: AI suggests tracks based on profile
- **Playlist Generation**: describe a mood → Claude picks tracks from library
- **Cover Art**: generates prompts for Replicate/Stability AI (optional)

### API Authentication
- Middleware at `src/middleware.ts` protects all `/api/*` routes
- **Localhost always bypasses** (local dev + Sonos callbacks)
- Remote requests need `Authorization: Bearer <TUNIFY_API_KEY>`
- If `TUNIFY_API_KEY` is empty/unset, auth is disabled entirely

### Remote Access (Tailscale)
- Install Tailscale on server + phone: `brew install tailscale && tailscale up`
- Access Tunify at `http://100.x.x.x:3101` from any device on the Tailscale network
- Set `TUNIFY_API_KEY` for remote auth

---

## Sonos Integration

Requires the `sonos` CLI tool:
- Located at `/opt/homebrew/bin/sonos`
- Functions: discover, status, playUri, play, pause, next, prev, setVolume, groupJoin
- Default speaker: "Office" (configured in Zustand store)
- Sonos plays audio by fetching `http://<TUNIFY_HOST>/api/audio/<filepath>`

---

## UI Theme

Spotify-inspired dark theme defined in `src/app/globals.css`:

| Token | Value |
|---|---|
| Background | `#121212` |
| Card | `#1a1a1a` |
| Primary (accent) | `#1DB954` (Spotify green) |
| Secondary | `#282828` |
| Muted text | `#a1a1a1` |
| Border | `#333333` |

Tailwind v4 with `@theme` directive. shadcn/ui components (new-york style).

---

## Files NOT in Git (Must Recreate)

| File | How to recreate |
|---|---|
| `.env.local` | See Environment section above |
| `tunify.db` | Auto-created on first `npm run dev` |
| `node_modules/` | `npm install` |
| `.next/` | `npm run dev` or `npm run build` |
| `public/covers/` | Auto-created on library scan |
| `~/.config/beets/config.yaml` | See Beets Configuration section above |
| `~/.config/beets/library.db` | Created by `beet import` |
| `old_project/` | Reference code from MyStreamBox (not needed to run) |

---

## System Dependencies

| Dependency | Install | Required for |
|---|---|---|
| Node.js 18+ | `brew install node` | Everything |
| Beets | `pipx install beets` | Library import, fetchart |
| FFmpeg | `brew install ffmpeg` | Mobile transcoding (`?quality=mobile`) |
| Sonos CLI | `/opt/homebrew/bin/sonos` | Speaker playback |
| Tailscale | `brew install tailscale` | Remote access |

---

## Common Commands

```bash
npm run dev          # Start dev server (port 3101)
npm run build        # Production build
npm run lint         # ESLint
npm run db:studio    # Drizzle Studio (browse DB)
beet import ~/Music/new-album   # Import music via Beets
beet ls              # List Beets library
beet fetchart        # Fetch missing album art
```

---

## Known Quirks & Notes

1. **Album IDs** in URLs are `albumArtist---album` (triple dash separator), URL-encoded
2. **Scan adapter auto-detection**: prefers Beets if `library.db` exists, falls back to filesystem
3. **Cover art hashing**: MD5 of `album + artist` → filename, avoids duplicates
4. **Tailwind v4**: uses new `@theme` directive instead of `tailwind.config.js`
5. **better-sqlite3 + music-metadata**: marked as `serverExternalPackages` in next.config.ts (Node.js native modules)
6. **`old_project/`** is excluded from both git and TypeScript compilation (`tsconfig.json` exclude)
7. **Player default**: output target is "sonos" with speaker "Office" — change in `src/store/player.ts` if needed
8. **ESLint**: `no-explicit-any` is turned off, `no-unused-vars` is warn-only
