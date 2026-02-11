import Database from "better-sqlite3";
import { MusicSourceAdapter, ScannedTrack } from "./types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface BeetsItem {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumartist: string;
  genre: string;
  year: number;
  track: number;
  disc: number;
  length: number;
  path: Buffer | string;
  format: string;
  bitrate: number;
  samplerate: number;
  artpath: Buffer | string | null;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as { name: string }[];
  return cols.some((c) => c.name === column);
}

function decodePath(p: Buffer | string | null): string | null {
  if (!p) return null;
  if (Buffer.isBuffer(p)) return p.toString("utf-8");
  return p;
}

export class BeetsAdapter implements MusicSourceAdapter {
  name = "beets";

  private getDbPath(): string {
    return process.env.BEETS_DB_PATH || path.join(os.homedir(), ".config", "beets", "library.db");
  }

  async *scan(
    _libraryPath: string,
    onProgress?: (current: number, total: number) => void
  ): AsyncGenerator<ScannedTrack> {
    const dbPath = this.getDbPath();
    const beetsDb = new Database(dbPath);

    try {
      const countRow = beetsDb.prepare("SELECT COUNT(*) as count FROM items").get() as { count: number };
      const total = countRow.count;

      // artpath may be on items (old Beets) or albums (Beets 2.x)
      const hasItemArtpath = hasColumn(beetsDb, "items", "artpath");
      const hasAlbumArtpath = hasColumn(beetsDb, "albums", "artpath");

      let query: string;
      if (hasItemArtpath) {
        query = `
          SELECT id, title, artist, album, albumartist, genre, year,
                 track, disc, length, path, format, bitrate, samplerate, artpath
          FROM items
          ORDER BY albumartist, album, disc, track`;
      } else if (hasAlbumArtpath) {
        query = `
          SELECT items.id, items.title, items.artist, items.album, items.albumartist,
                 items.genre, items.year, items.track, items.disc, items.length,
                 items.path, items.format, items.bitrate, items.samplerate,
                 albums.artpath
          FROM items
          LEFT JOIN albums ON items.album_id = albums.id
          ORDER BY items.albumartist, items.album, items.disc, items.track`;
      } else {
        query = `
          SELECT id, title, artist, album, albumartist, genre, year,
                 track, disc, length, path, format, bitrate, samplerate,
                 NULL as artpath
          FROM items
          ORDER BY albumartist, album, disc, track`;
      }

      const rows = beetsDb.prepare(query).iterate() as IterableIterator<BeetsItem>;

      // Pre-load music-metadata for embedded art fallback
      const mm = await import("music-metadata");
      const albumCoverCache = new Map<string, { data: Buffer; format: string } | null>();

      // Remap paths if BEETS_PATH_REMAP is set (e.g. "/Volumes/Music:/Volumes/Music-1")
      const pathRemap = process.env.BEETS_PATH_REMAP;
      const [remapFrom, remapTo] = pathRemap ? pathRemap.split("::") : [null, null];

      let current = 0;
      for (const row of rows) {
        current++;
        if (onProgress) onProgress(current, total);

        let filePath = decodePath(row.path);
        if (!filePath) continue;

        if (remapFrom && remapTo && filePath.startsWith(remapFrom) && !filePath.startsWith(remapTo)) {
          filePath = remapTo + filePath.slice(remapFrom.length);
        }

        // Check the file actually exists
        try {
          fs.accessSync(filePath);
        } catch {
          continue;
        }

        const stat = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(".", "");

        // Read cover art: try artpath first, fall back to embedded art
        let coverData: { data: Buffer; format: string } | undefined;
        let artPath = decodePath(row.artpath);
        if (artPath && remapFrom && remapTo && artPath.startsWith(remapFrom) && !artPath.startsWith(remapTo)) {
          artPath = remapTo + artPath.slice(remapFrom.length);
        }
        if (artPath) {
          try {
            const artBuffer = fs.readFileSync(artPath);
            const artExt = path.extname(artPath).toLowerCase();
            const fmt = artExt === ".png" ? "png" : "jpeg";
            coverData = { data: artBuffer, format: fmt };
          } catch {
            // Art file missing, try embedded
          }
        }
        if (!coverData) {
          const albumKey = `${row.albumartist}|||${row.album}`;
          if (albumCoverCache.has(albumKey)) {
            coverData = albumCoverCache.get(albumKey) || undefined;
          } else {
            try {
              const metadata = await mm.parseFile(filePath);
              if (metadata.common.picture && metadata.common.picture.length > 0) {
                const pic = metadata.common.picture[0];
                coverData = {
                  data: Buffer.from(pic.data),
                  format: pic.format.replace("image/", ""),
                };
              }
            } catch {
              // No embedded art either
            }
            albumCoverCache.set(albumKey, coverData || null);
          }
        }

        yield {
          title: row.title || path.basename(filePath, path.extname(filePath)),
          artist: row.artist || "Unknown Artist",
          album: row.album || "Unknown Album",
          albumArtist: row.albumartist || undefined,
          genre: row.genre || undefined,
          year: row.year || undefined,
          trackNumber: row.track || undefined,
          discNumber: row.disc || undefined,
          duration: row.length || 0,
          filePath,
          fileSize: stat.size,
          format: row.format?.toUpperCase() || ext.toUpperCase(),
          bitrate: row.bitrate || undefined,
          sampleRate: row.samplerate || undefined,
          coverData,
        };
      }
    } finally {
      beetsDb.close();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const dbPath = this.getDbPath();
      fs.accessSync(dbPath);
      return true;
    } catch {
      return false;
    }
  }
}
