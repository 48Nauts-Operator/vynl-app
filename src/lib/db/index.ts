import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "vynl.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Initialize tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT 'Unknown Artist',
    album TEXT NOT NULL DEFAULT 'Unknown Album',
    album_artist TEXT,
    genre TEXT,
    year INTEGER,
    track_number INTEGER,
    disc_number INTEGER,
    duration REAL NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL UNIQUE,
    file_size INTEGER,
    format TEXT,
    bitrate INTEGER,
    sample_rate INTEGER,
    cover_path TEXT,
    source TEXT NOT NULL DEFAULT 'local',
    source_id TEXT,
    added_at TEXT DEFAULT (datetime('now')),
    last_played_at TEXT,
    play_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    cover_path TEXT,
    is_auto_generated INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS listening_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    track_title TEXT NOT NULL,
    track_artist TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'local',
    played_at TEXT DEFAULT (datetime('now')),
    duration REAL,
    listened_duration REAL,
    output_target TEXT DEFAULT 'browser'
  );

  CREATE TABLE IF NOT EXISTS discovery_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    genres TEXT,
    mood_level INTEGER,
    tempo_level INTEGER,
    era_preference TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS taste_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES discovery_sessions(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    track_title TEXT NOT NULL,
    track_artist TEXT NOT NULL,
    rating TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS taste_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_text TEXT NOT NULL,
    genre_distribution TEXT,
    top_artists TEXT,
    mood_preferences TEXT,
    generated_at TEXT DEFAULT (datetime('now')),
    feedback_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS album_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    target_album TEXT NOT NULL,
    target_album_artist TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS track_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    rated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS track_lyrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    format TEXT NOT NULL,
    source TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS podcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    feed_url TEXT NOT NULL UNIQUE,
    cover_url TEXT,
    cover_path TEXT,
    last_fetched_at TEXT,
    added_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS podcast_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    podcast_id INTEGER NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
    guid TEXT,
    title TEXT NOT NULL,
    description TEXT,
    pub_date TEXT,
    duration REAL,
    audio_url TEXT NOT NULL,
    local_path TEXT,
    cover_url TEXT,
    cover_path TEXT,
    file_size INTEGER,
    listened_at TEXT,
    play_position REAL DEFAULT 0,
    is_downloaded INTEGER DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS episode_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dj_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audience TEXT,
    vibe TEXT NOT NULL,
    duration_minutes INTEGER,
    occasion TEXT,
    special_requests TEXT,
    dj_notes TEXT,
    track_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'generating',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dj_session_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES dj_sessions(id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    dj_note TEXT,
    played INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS track_audio_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
    bpm REAL,
    energy REAL,
    danceability REAL,
    key TEXT,
    camelot TEXT,
    genre_refined TEXT,
    style_tags TEXT,
    analysis_method TEXT NOT NULL DEFAULT 'llm',
    confidence REAL DEFAULT 0.5,
    analyzed_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS spotify_auth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    spotify_user_id TEXT NOT NULL,
    spotify_display_name TEXT
  );

  CREATE TABLE IF NOT EXISTS spotify_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'running',
    total_playlists INTEGER DEFAULT 0,
    total_tracks INTEGER DEFAULT 0,
    total_liked_songs INTEGER DEFAULT 0,
    matched_tracks INTEGER DEFAULT 0,
    unmatched_tracks INTEGER DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS spotify_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES spotify_snapshots(id) ON DELETE CASCADE,
    spotify_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    track_count INTEGER DEFAULT 0,
    vynl_playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS spotify_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL REFERENCES spotify_snapshots(id) ON DELETE CASCADE,
    spotify_id TEXT NOT NULL,
    spotify_uri TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    isrc TEXT,
    duration_ms INTEGER,
    cover_url TEXT,
    preview_url TEXT,
    is_liked_song INTEGER DEFAULT 0,
    bpm REAL,
    energy REAL,
    danceability REAL,
    valence REAL,
    audio_key INTEGER,
    audio_mode INTEGER,
    local_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    match_method TEXT,
    match_confidence REAL
  );

  CREATE TABLE IF NOT EXISTS spotify_playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spotify_playlist_id INTEGER NOT NULL REFERENCES spotify_playlists(id) ON DELETE CASCADE,
    spotify_track_id INTEGER NOT NULL REFERENCES spotify_tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wish_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'spotify_missing',
    seed_title TEXT,
    seed_artist TEXT,
    seed_album TEXT,
    spotify_track_id INTEGER REFERENCES spotify_tracks(id) ON DELETE SET NULL,
    spotify_uri TEXT,
    isrc TEXT,
    cover_url TEXT,
    spotify_playlist_names TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lidarr_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    root_folder_path TEXT,
    quality_profile_id INTEGER,
    metadata_profile_id INTEGER,
    last_tested_at TEXT,
    last_test_result TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS watcher_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    enabled INTEGER DEFAULT 0,
    watch_paths TEXT NOT NULL DEFAULT '[]',
    debounce_seconds INTEGER DEFAULT 10,
    auto_delete_on_success INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations — add columns that may not exist in older databases
try {
  sqlite.pragma(`table_info(tracks)`);
  const cols = sqlite.pragma(`table_info(tracks)`) as { name: string }[];
  if (!cols.some((c: { name: string }) => c.name === "isrc")) {
    sqlite.prepare(`ALTER TABLE tracks ADD COLUMN isrc TEXT`).run();
  }
} catch {
  // Column check failed, try adding anyway
  try { sqlite.prepare(`ALTER TABLE tracks ADD COLUMN isrc TEXT`).run(); } catch { /* already exists */ }
}
try {
  sqlite.prepare(`CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON tracks(isrc)`).run();
} catch {
  // Index already exists
}

// Add popularity column to spotify_tracks
try { sqlite.prepare(`ALTER TABLE spotify_tracks ADD COLUMN popularity INTEGER`).run(); } catch { /* already exists */ }
// Add popularity column to wish_list
try { sqlite.prepare(`ALTER TABLE wish_list ADD COLUMN popularity INTEGER`).run(); } catch { /* already exists */ }

export { schema };
