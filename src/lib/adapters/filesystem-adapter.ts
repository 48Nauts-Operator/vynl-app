import { MusicSourceAdapter, ScannedTrack } from "./types";
import * as fs from "fs";
import * as path from "path";

const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".wma", ".aiff",
]);

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.has(ext)) {
        yield fullPath;
      }
    }
  }
}

export class FilesystemAdapter implements MusicSourceAdapter {
  name = "filesystem";

  async *scan(
    libraryPath: string,
    onProgress?: (current: number, total: number) => void
  ): AsyncGenerator<ScannedTrack> {
    // First count files for progress
    const files: string[] = [];
    for await (const filePath of walkDir(libraryPath)) {
      files.push(filePath);
    }

    const total = files.length;
    let current = 0;

    // Dynamic import for music-metadata (ESM module)
    const mm = await import("music-metadata");

    for (const filePath of files) {
      current++;
      if (onProgress) onProgress(current, total);

      try {
        const stat = await fs.promises.stat(filePath);
        const metadata = await mm.parseFile(filePath);
        const common = metadata.common;
        const format = metadata.format;

        let coverData: ScannedTrack["coverData"] = undefined;
        if (common.picture && common.picture.length > 0) {
          const pic = common.picture[0];
          coverData = {
            data: Buffer.from(pic.data),
            format: pic.format.replace("image/", ""),
          };
        }

        yield {
          title: common.title || path.basename(filePath, path.extname(filePath)),
          artist: common.artist || "Unknown Artist",
          album: common.album || "Unknown Album",
          albumArtist: common.albumartist || undefined,
          genre: common.genre?.[0] || undefined,
          year: common.year || undefined,
          trackNumber: common.track?.no || undefined,
          discNumber: common.disk?.no || undefined,
          duration: format.duration || 0,
          filePath,
          fileSize: stat.size,
          format: path.extname(filePath).slice(1).toUpperCase(),
          bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
          sampleRate: format.sampleRate || undefined,
          coverData,
        };
      } catch (err) {
        console.error(`Error processing ${filePath}:`, err);
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
