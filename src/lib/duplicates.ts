import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";

// Quality ranking (higher is better)
const FORMAT_QUALITY: Record<string, number> = {
  FLAC: 5,
  ALAC: 4,
  M4A: 3,
  AAC: 3,
  OGG: 2,
  MP3: 1,
  WMA: 0,
};

export interface DuplicateSet {
  key: string;
  artist: string;
  album: string;
  title: string;
  copies: {
    id: number;
    filePath: string;
    format: string;
    quality: number;
    fileSize: number;
    bitrate: number | null;
  }[];
}

export interface DuplicateAnalysis {
  duplicateSets: DuplicateSet[];
  totalDuplicateFiles: number;
  wastedSpaceBytes: number;
  formatDistribution: Record<string, number>;
}

export function findDuplicates(): DuplicateAnalysis {
  const allTracks = db
    .select()
    .from(tracks)
    .orderBy(tracks.artist, tracks.album, tracks.title)
    .all();

  // Group by normalized artist|album|title
  const groups = new Map<string, typeof allTracks>();
  for (const track of allTracks) {
    const key = [
      (track.artist || "").toLowerCase().trim(),
      (track.album || "").toLowerCase().trim(),
      (track.title || "").toLowerCase().trim(),
    ].join("|");

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(track);
  }

  const duplicateSets: DuplicateSet[] = [];
  let totalDuplicateFiles = 0;
  let wastedSpaceBytes = 0;
  const formatDistribution: Record<string, number> = {};

  for (const [key, items] of groups) {
    if (items.length <= 1) continue;

    const copies = items.map((t) => {
      const format = (t.format || "").toUpperCase();
      const quality = FORMAT_QUALITY[format] ?? 0;
      formatDistribution[format] = (formatDistribution[format] || 0) + 1;
      return {
        id: t.id,
        filePath: t.filePath,
        format,
        quality,
        fileSize: t.fileSize || 0,
        bitrate: t.bitrate,
      };
    });

    // Sort by quality desc, then file size desc
    copies.sort((a, b) => b.quality - a.quality || b.fileSize - a.fileSize);

    totalDuplicateFiles += copies.length - 1;
    // Wasted space = sum of all but the best copy
    for (let i = 1; i < copies.length; i++) {
      wastedSpaceBytes += copies[i].fileSize;
    }

    duplicateSets.push({
      key,
      artist: items[0].artist,
      album: items[0].album,
      title: items[0].title,
      copies,
    });
  }

  return { duplicateSets, totalDuplicateFiles, wastedSpaceBytes, formatDistribution };
}

export function removeDuplicates(dryRun: boolean): {
  filesRemoved: number;
  spaceFreedBytes: number;
  errors: string[];
} {
  const { duplicateSets } = findDuplicates();
  let filesRemoved = 0;
  let spaceFreedBytes = 0;
  const errors: string[] = [];

  for (const dup of duplicateSets) {
    // copies[0] is the best quality — keep it, remove the rest
    for (let i = 1; i < dup.copies.length; i++) {
      const copy = dup.copies[i];
      try {
        if (!dryRun) {
          // Delete the file
          try {
            fs.unlinkSync(copy.filePath);
          } catch {
            // File already gone — still remove from DB
          }
          // Remove from DB
          db.delete(tracks)
            .where(sql`${tracks.id} = ${copy.id}`)
            .run();
        }
        filesRemoved++;
        spaceFreedBytes += copy.fileSize;
      } catch (err) {
        errors.push(`Failed to remove ${copy.filePath}: ${err}`);
      }
    }
  }

  return { filesRemoved, spaceFreedBytes, errors };
}
