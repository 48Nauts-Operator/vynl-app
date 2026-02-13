# vynl.music Docs Update — 2026-02-13

Instructions for updating the documentation site at https://vynl.music/docs

---

## Page: Getting Started

> Replace the full content of the "Getting Started" page.

### Getting Started

Vynl is a self-hosted music streaming platform with AI-powered discovery. It runs on any machine with Docker — a Raspberry Pi, an old laptop, a NAS, or a cloud VPS.

#### Prerequisites

- A machine running Docker (or Node.js 18+ for native install)
- Your music library (MP3, FLAC, M4A, AAC, OGG, Opus, WAV, WMA, AIFF)
- An Anthropic API key (for AI features — optional but recommended)

#### Quick Start (Docker)

Pre-built images are available on GHCR for **x86_64** and **ARM64**:

```terminal
docker pull ghcr.io/48nauts-operator/vynl-app:latest
```

Or up and running in 4 commands:

```terminal
git clone https://github.com/48Nauts-Operator/vynl-app.git
cd vynl-app
cp .env.example .env    # Edit with your paths and API keys
docker compose up -d
```

Open `http://<YOUR_IP>:3101` in your browser. That's it.

> **Important:** Use your machine's LAN IP (e.g. `192.168.1.100`), not `localhost`, if you plan to use Sonos speakers.

#### System Requirements

| CPU | RAM | Storage |
|---|---|---|
| Any x86_64 or ARM64 | 512MB min, 2GB recommended | 200MB + your music library |

---

## Page: Docker Installation

> Replace the full content of the "Docker Installation" page.

### Docker Installation

#### Option 1: Pull Pre-Built Image (Recommended)

Pre-built images are published automatically on every release to GitHub Container Registry:

```terminal
docker pull ghcr.io/48nauts-operator/vynl-app:latest
```

This works on both **x86_64** (Intel/AMD) and **ARM64** (Raspberry Pi, Apple Silicon, etc.)

#### Option 2: Docker Compose

```terminal
git clone https://github.com/48Nauts-Operator/vynl-app.git
cd vynl-app
cp .env.example .env
docker compose up -d
```

#### Option 3: Portainer / Stack Deployment

Use image: `ghcr.io/48nauts-operator/vynl-app:latest`

**Environment Variables:**

| Variable | Required | Description | Example |
|---|---|---|---|
| `HOST_IP` | Yes | Your machine's LAN IP | `192.168.1.100` |
| `MUSIC_LIBRARY_PATH` | Yes | Path to your music on the host | `/mnt/nas/music` |
| `ANTHROPIC_API_KEY` | No | For AI discovery & recommendations | `sk-ant-...` |
| `SPOTIFY_CLIENT_ID` | No | Spotify library extract | |
| `SPOTIFY_CLIENT_SECRET` | No | Spotify library extract | |
| `SPOTIFY_REDIRECT_URI` | No | Must use `127.0.0.1`, not `localhost` | `http://127.0.0.1:3101/api/spotify/callback` |

**Volumes:**

| Container Path | Purpose |
|---|---|
| `/music/library` | Music library directory |
| `/music/library.db` | Beets SQLite database |
| `/music/podcasts` | Podcast episode storage |
| `/app/data` | Persistent app data (named volume) |
| `/app/public/covers` | Cover art cache (named volume) |

#### Option 4: Build Locally

If you prefer to build the image yourself:

```terminal
git clone https://github.com/48Nauts-Operator/vynl-app.git
cd vynl-app
cp .env.example .env
```

Edit `docker-compose.yml` — comment out `image:` and uncomment `build: .`:

```yaml
services:
  vynl:
    # image: ghcr.io/48nauts-operator/vynl-app:latest
    build: .
```

Then:

```terminal
docker compose up -d --build
```

#### Configuration

Edit your `.env` file with your network and library settings:

```env
HOST_IP=192.168.1.100
MUSIC_LIBRARY_PATH=/mnt/nas/music
ANTHROPIC_API_KEY=sk-ant-...
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

#### Sonos Networking

For Sonos speakers to stream audio from Vynl, they need to reach your container over the network. If speakers can't play tracks:

- Ensure `HOST_IP` is set to your machine's LAN IP (not `localhost`)
- Try host networking: uncomment `network_mode: host` in `docker-compose.yml` and remove the `ports` section

#### Notes

- The Docker image (~200MB) includes Beets and FFmpeg pre-installed
- Images are automatically rebuilt on every push to `main`
- Whisper and Fabric AI for podcast transcription/analysis are not yet available in Docker — planned for a future release

---

## Page: Native Installation

> Replace the full content of the "Native Installation" page.

### Native Installation

For development or when you prefer running without Docker.

#### Prerequisites

- **Node.js** 18+
- **Beets** (`pip install beets`) for auto-tagging
- **FFmpeg** for audio transcoding
- Optional: **Whisper** for podcast transcription
- Optional: **Fabric** for AI podcast analysis

#### Install

```terminal
git clone https://github.com/48Nauts-Operator/vynl-app.git
cd vynl-app
npm install
cp .env.example .env.local
```

#### Configure

Edit `.env.local` with your paths and API keys:

```env
MUSIC_LIBRARY_PATH=/Volumes/Music/library
BEETS_DB_PATH=/Volumes/Music/library.db
VYNL_HOST=http://192.168.1.100:3101
NEXT_PUBLIC_VYNL_HOST=http://192.168.1.100:3101
ANTHROPIC_API_KEY=sk-ant-...
```

#### Run

```terminal
npm run dev
```

Open [http://localhost:3101](http://localhost:3101)

---

## Page: Configuration

> Replace the full content of the "Configuration" page.

### Configuration

#### Environment Variables

| Variable | Description | Example |
|---|---|---|
| `MUSIC_LIBRARY_PATH` | Path to organized music library | `/Volumes/Music/library` |
| `BEETS_DB_PATH` | Path to beets SQLite database | `/Volumes/Music/library.db` |
| `BEETS_PATH_REMAP` | Remap old paths in DB | `/Volumes/Music-1::/Volumes/Music` |
| `VYNL_HOST` | Host URL for Sonos callback | `http://192.168.1.100:3101` |
| `NEXT_PUBLIC_VYNL_HOST` | Client-side host URL | `http://192.168.1.100:3101` |
| `PODCAST_STORAGE_PATH` | Where to store podcast episodes | `/Volumes/Music/podcasts` |
| `ANTHROPIC_API_KEY` | For AI discovery & recommendations | `sk-ant-...` |
| `SPOTIFY_CLIENT_ID` | Spotify library extract | |
| `SPOTIFY_CLIENT_SECRET` | Spotify library extract | |
| `SPOTIFY_REDIRECT_URI` | Spotify OAuth callback (must use `127.0.0.1`) | `http://127.0.0.1:3101/api/spotify/callback` |

#### Beets

Vynl reads from your existing beets library. Make sure `~/.config/beets/config.yaml` is configured:

```yaml
directory: /Volumes/Music/library
library: /Volumes/Music/library.db
import:
  move: yes
  duplicate_action: skip
plugins: fetchart embedart
```

#### Sonos

Set `VYNL_HOST` and `NEXT_PUBLIC_VYNL_HOST` to your machine's LAN IP (not `localhost`) so Sonos speakers can stream audio back from Vynl.

For Docker: set `HOST_IP` in your `.env` — it's used to build both `VYNL_HOST` and `NEXT_PUBLIC_VYNL_HOST` automatically.

#### NAS

Vynl works with network-mounted storage (SMB, AFP, NFS). The batch import checks that the NAS is mounted before starting and handles path remapping for mount point changes via `BEETS_PATH_REMAP`.

#### Spotify

To connect your Spotify account for library extraction:

1. Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Add redirect URI: `http://127.0.0.1:3101/api/spotify/callback`
   - **Must use `127.0.0.1`** — Spotify requires explicit loopback IP, not `localhost`
3. Copy Client ID and Client Secret to your `.env` / Settings page
4. Go to Settings in Vynl and click "Connect Spotify"

#### Feature Toggles

Enable or disable features from the Settings page:

- Podcasts
- YouTube
- Party Mode / AI DJ
- Discover / AI Recommendations
- Taste Profile
- Playlists

---

## Sidebar: New Feature Pages to Add

> Add these to the FEATURES section in the sidebar if not already present:

| Page | Sidebar Label |
|---|---|
| Spotify Integration | Spotify |
| Wishlist | Wishlist |
| Ratings & Stats | (merge into "Playlists & Stats") |

---

## Page: Spotify Integration (NEW)

> Create a new page under FEATURES.

### Spotify Integration

Connect your Spotify account to extract your entire library into Vynl.

#### What Gets Extracted

- All playlists (name, description, cover art, tracks)
- Liked songs
- Track metadata (title, artist, album, ISRC, duration, cover art)
- Audio features (BPM, energy, danceability, valence, key, mode)

#### How It Works

1. **Connect** — Go to Settings and click "Connect Spotify". OAuth flow handles authentication.
2. **Extract** — Click "Start Extraction". A 7-phase background pipeline runs:
   - Fetch playlists
   - Fetch playlist tracks
   - Fetch liked songs
   - Fetch audio features (batched)
   - Match against local library (ISRC + fuzzy artist/title)
   - Mirror matched playlists as Vynl playlists
   - Populate wishlist with unmatched tracks
3. **Review** — Check your new playlists and wishlist from the sidebar.

#### Matching

Tracks are matched against your local beets library using two strategies:

| Method | Confidence | Description |
|---|---|---|
| ISRC | 1.0 | Exact ISRC match (when available) |
| Fuzzy | 0.95 | Normalized artist + title match (strips feat., remix, remastered, punctuation) |

#### Wishlist

Unmatched tracks go to the Wishlist page (`/wishlist`) where you can:

- Filter by status (pending, completed, dismissed)
- Filter by Spotify playlist
- Detect and remove duplicates (same song from different albums/compilations)
- Search across title, artist, album, and playlist names

#### Limitations

- Spotify API does not expose per-user play counts
- Preview URLs (30s clips) are available but not all tracks have them
- Re-extraction creates a new snapshot; previous data is preserved

---

## Page: Wishlist (NEW)

> Create a new page under FEATURES.

### Wishlist

The Wishlist tracks songs you want but don't have in your local library. Currently populated from Spotify extraction (unmatched tracks).

#### Filters

- **Status** — All, Pending, Completed, Dismissed
- **Duplicates** — Shows tracks that appear as multiple rows (same song from different Spotify albums/compilations). Click "Remove Dupes" to batch-dismiss extras.
- **Playlist** — Filter by which Spotify playlist the track belongs to
- **Search** — Free-text search across title, artist, album, and playlist names

#### Actions

- **Dismiss** — Mark a track as dismissed (hide from default view)
- **Open in Spotify** — Link to the track on Spotify
- **Remove Dupes** — Batch operation with progress bar and live log output

---

## Page: Karaoke Mode

> Update or create under FEATURES.

### Karaoke Mode

Split-screen karaoke experience at `/karaoke`.

- **Left panel** — Track queue with playback controls
- **Right panel** — Time-synced lyrics that scroll with the music
- **Lyrics pipeline** — Cache (database) > embedded metadata > LRCLIB API
- Works with both local playback and Sonos

---

## Page: Playlists & Stats

> Update existing page to include ratings and stats.

### Playlists

- **Create** — Manual playlists or AI-generated (by mood/activity)
- **Views** — Grid view (cover art cards) or List view (sortable table)
- **Track detail** — List or Table view with sortable columns (#, Title, Artist, Album, Duration)
- **Spotify mirrored** — Playlists from Spotify extraction auto-created with matched tracks

### Ratings

- Rate any track from 1-5 using golden vinyl icons
- Album ratings are computed as the average of their track ratings
- Ratings visible on track rows, album detail pages, and stats

### Stats (`/stats`)

- Best rated albums and tracks
- Most played tracks
- Total listening hours
- Worst rated tracks with option to archive
