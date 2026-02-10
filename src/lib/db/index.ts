import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "tunify.db");

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

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

export { schema };
