import Database from "better-sqlite3";
import path from "path";
import * as mm from "music-metadata";

const DB_PATH = path.join(process.cwd(), "vynl.db");

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  content: string;
  format: "lrc" | "plain";
  source: "embedded" | "lrclib" | "manual";
  lines?: LyricLine[];
}

// ---------- LRC Parser ----------

const LRC_TIME_REGEX = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;
const LRC_META_TAGS = /^\[(ar|ti|al|by|offset|re|ve):/i;

export function parseLRC(lrcContent: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of lrcContent.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed || LRC_META_TAGS.test(trimmed)) continue;

    const match = trimmed.match(LRC_TIME_REGEX);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
    const text = match[4].trim();

    lines.push({ time: minutes * 60 + seconds + ms / 1000, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

function isLRC(text: string): boolean {
  return /\[\d{1,2}:\d{2}/.test(text);
}

// ---------- Embedded Lyrics Reader ----------

export async function fetchEmbeddedLyrics(filePath: string): Promise<{
  syncedLyrics: string | null;
  plainLyrics: string | null;
}> {
  try {
    const metadata = await mm.parseFile(filePath);
    const lyricsArr = metadata.common.lyrics;

    if (lyricsArr && lyricsArr.length > 0) {
      for (const entry of lyricsArr) {
        const text = typeof entry === "string" ? entry : entry?.text;
        if (!text) continue;
        if (isLRC(text)) return { syncedLyrics: text, plainLyrics: null };
        return { syncedLyrics: null, plainLyrics: text };
      }
    }

    // Check native tags for USLT (ID3) or LYRICS (Vorbis)
    for (const format of Object.values(metadata.native || {})) {
      for (const tag of format) {
        if (
          tag.id === "USLT" ||
          tag.id === "LYRICS" ||
          tag.id === "UNSYNCED LYRICS"
        ) {
          const tagVal = tag.value as string | { text?: string };
          const text =
            typeof tagVal === "string" ? tagVal : tagVal?.text;
          if (!text) continue;
          if (isLRC(text)) return { syncedLyrics: text, plainLyrics: null };
          return { syncedLyrics: null, plainLyrics: text };
        }
      }
    }
  } catch {
    // File not readable or no metadata
  }

  return { syncedLyrics: null, plainLyrics: null };
}

// ---------- LRCLIB Client ----------

export async function fetchFromLRCLIB(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<{ syncedLyrics: string | null; plainLyrics: string | null } | null> {
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });
    if (album) params.set("album_name", album);
    if (duration && duration > 0) params.set("duration", String(Math.round(duration)));

    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "User-Agent": "Vynl Music Player v1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      syncedLyrics: data.syncedLyrics || null,
      plainLyrics: data.plainLyrics || null,
    };
  } catch {
    return null;
  }
}

// ---------- Database Cache ----------

export function getCachedLyrics(trackId: number): LyricsResult | null {
  try {
    const bdb = new Database(DB_PATH);
    const row = bdb
      .prepare("SELECT content, format, source FROM track_lyrics WHERE track_id = ?")
      .get(trackId) as { content: string; format: string; source: string } | undefined;
    bdb.close();

    if (!row) return null;

    return {
      content: row.content,
      format: row.format as "lrc" | "plain",
      source: row.source as "embedded" | "lrclib" | "manual",
      lines: row.format === "lrc" ? parseLRC(row.content) : undefined,
    };
  } catch {
    return null;
  }
}

export function saveLyrics(
  trackId: number,
  content: string,
  format: "lrc" | "plain",
  source: string
): void {
  try {
    const bdb = new Database(DB_PATH);
    bdb
      .prepare(
        `INSERT OR REPLACE INTO track_lyrics (track_id, content, format, source, fetched_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(trackId, content, format, source);
    bdb.close();
  } catch {
    // Best-effort
  }
}
