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

function decodePath(p: Buffer | string | null): string | null {
  if (!p) return null;
  if (Buffer.isBuffer(p)) return p.toString("utf-8");
  return p;
}

export class BeetsAdapter implements MusicSourceAdapter {
  name = "beets";

  private getDbPath(): string {
    return path.join(os.homedir(), ".config", "beets", "library.db");
  }

  async *scan(
    _libraryPath: string,
    onProgress?: (current: number, total: number) => void
  ): AsyncGenerator<ScannedTrack> {
    const dbPath = this.getDbPath();
    const beetsDb = new Database(dbPath, { readonly: true });

    try {
      const countRow = beetsDb.prepare("SELECT COUNT(*) as count FROM items").get() as { count: number };
      const total = countRow.count;

      const rows = beetsDb.prepare(`
        SELECT id, title, artist, album, albumartist, genre, year,
               track, disc, length, path, format, bitrate, samplerate, artpath
        FROM items
        ORDER BY albumartist, album, disc, track
      `).iterate() as IterableIterator<BeetsItem>;

      let current = 0;
      for (const row of rows) {
        current++;
        if (onProgress) onProgress(current, total);

        const filePath = decodePath(row.path);
        if (!filePath) continue;

        // Check the file actually exists
        try {
          fs.accessSync(filePath);
        } catch {
          continue;
        }

        const stat = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(".", "");

        // Read cover art if artpath exists
        let coverData: { data: Buffer; format: string } | undefined;
        const artPath = decodePath(row.artpath);
        if (artPath) {
          try {
            const artBuffer = fs.readFileSync(artPath);
            const artExt = path.extname(artPath).toLowerCase();
            const format = artExt === ".png" ? "png" : "jpeg";
            coverData = { data: artBuffer, format };
          } catch {
            // Art file missing, skip
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
