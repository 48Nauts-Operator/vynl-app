import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import { parseFile } from "music-metadata";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);

function getBeetsDbPath(): string {
  return process.env.BEETS_DB_PATH || path.join(os.homedir(), ".config", "beets", "library.db");
}

function decodePath(p: Buffer | string | null): string | null {
  if (!p) return null;
  if (Buffer.isBuffer(p)) return p.toString("utf-8");
  return p;
}

/** Remove empty directories up the tree until a non-empty parent */
function cleanEmptyDirs(dirPath: string, stopAt: string) {
  let current = dirPath;
  while (current !== stopAt && current.length > stopAt.length) {
    try {
      const entries = fs.readdirSync(current);
      if (entries.length === 0) {
        fs.rmdirSync(current);
        current = path.dirname(current);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

/** Merge a single split album: update DBs, move files, clean dirs */
async function mergeSplitAlbum(albumName: string, primaryArtist: string) {
  const libraryPath = process.env.MUSIC_LIBRARY_PATH || "/Volumes/Music-1/library";
  let tracksUpdated = 0;
  let filesMoved = 0;
  let directoriesCleaned = 0;

  // 1. Get all tracks for this album in Vynl DB
  const albumTracks = db.all(sql`
    SELECT * FROM tracks WHERE album = ${albumName}
  `) as Array<{
    id: number; filePath: string; artist: string; albumArtist: string | null;
    album: string; title: string;
  }>;

  if (albumTracks.length === 0) {
    return { merged: false, error: "No tracks found for album" };
  }

  // 2. Determine target directory
  const targetDir = path.join(libraryPath, primaryArtist, albumName);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 3. Move files and update Vynl DB
  for (const track of albumTracks) {
    const oldPath = track.filePath;
    const fileName = path.basename(oldPath);
    const newPath = path.join(targetDir, fileName);

    // Move file if needed
    if (oldPath !== newPath && fs.existsSync(oldPath)) {
      // Handle filename collision
      if (fs.existsSync(newPath) && oldPath !== newPath) {
        // Same file already in target — skip move
      } else {
        fs.renameSync(oldPath, newPath);
        filesMoved++;
      }

      // Clean empty source directory
      const oldDir = path.dirname(oldPath);
      cleanEmptyDirs(oldDir, libraryPath);
      directoriesCleaned++;
    }

    // Update Vynl DB
    db.run(sql`
      UPDATE tracks
      SET album_artist = ${primaryArtist},
          file_path = ${newPath}
      WHERE id = ${track.id}
    `);
    tracksUpdated++;
  }

  // 4. Update beets DB
  try {
    const beetsDbPath = getBeetsDbPath();
    if (fs.existsSync(beetsDbPath)) {
      const beetsDb = new Database(beetsDbPath);

      // Update items (tracks) in beets
      const beetsItems = beetsDb.prepare(`
        SELECT id, path FROM items WHERE album = ?
      `).all(albumName) as { id: number; path: Buffer | string }[];

      for (const item of beetsItems) {
        const oldItemPath = decodePath(item.path);
        if (!oldItemPath) continue;
        const fileName = path.basename(oldItemPath);
        const newItemPath = path.join(targetDir, fileName);

        beetsDb.prepare(`
          UPDATE items SET albumartist = ?, path = ? WHERE id = ?
        `).run(primaryArtist, Buffer.from(newItemPath, "utf-8"), item.id);
      }

      // Merge albums entries: find all album IDs for this album name
      const beetsAlbums = beetsDb.prepare(`
        SELECT id, albumartist FROM albums WHERE album = ?
      `).all(albumName) as { id: number; albumartist: string }[];

      if (beetsAlbums.length > 1) {
        // Keep the first album entry, reassign items from others
        const keepId = beetsAlbums[0].id;
        for (let i = 1; i < beetsAlbums.length; i++) {
          beetsDb.prepare(`UPDATE items SET album_id = ? WHERE album_id = ?`).run(keepId, beetsAlbums[i].id);
          beetsDb.prepare(`DELETE FROM albums WHERE id = ?`).run(beetsAlbums[i].id);
        }
        // Update the kept album's artist
        beetsDb.prepare(`UPDATE albums SET albumartist = ? WHERE id = ?`).run(primaryArtist, keepId);

        // Update artpath to point to target directory
        const artpath = path.join(targetDir, "cover.jpg");
        beetsDb.prepare(`UPDATE albums SET artpath = ? WHERE id = ?`).run(Buffer.from(artpath, "utf-8"), keepId);
      } else if (beetsAlbums.length === 1) {
        beetsDb.prepare(`UPDATE albums SET albumartist = ? WHERE id = ?`).run(primaryArtist, beetsAlbums[0].id);
      }

      beetsDb.close();
    }
  } catch (err) {
    console.error("Beets DB update error (non-fatal):", err);
  }

  return { merged: true, tracksUpdated, filesMoved, directoriesCleaned };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "clean-missing": {
        const allTracks = db.select().from(tracks).all();
        let removed = 0;

        for (const track of allTracks) {
          try {
            fs.accessSync(track.filePath);
          } catch {
            db.delete(tracks)
              .where(sql`${tracks.id} = ${track.id}`)
              .run();
            removed++;
          }
        }

        return NextResponse.json({
          action,
          removed,
          message: `Removed ${removed} entries with missing files`,
        });
      }

      case "refresh-metadata": {
        const allTracks = db.select().from(tracks).all();
        let updated = 0;
        let errors = 0;

        for (const track of allTracks) {
          try {
            fs.accessSync(track.filePath);
            const metadata = await parseFile(track.filePath);
            const { common, format } = metadata;

            db.update(tracks)
              .set({
                title: common.title || track.title,
                artist: common.artist || track.artist,
                album: common.album || track.album,
                albumArtist: common.albumartist || track.albumArtist,
                genre: common.genre?.[0] || track.genre,
                year: common.year || track.year,
                trackNumber: common.track?.no || track.trackNumber,
                discNumber: common.disk?.no || track.discNumber,
                duration: format.duration || track.duration,
                bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : track.bitrate,
                sampleRate: format.sampleRate || track.sampleRate,
              })
              .where(sql`${tracks.id} = ${track.id}`)
              .run();

            updated++;
          } catch {
            errors++;
          }
        }

        return NextResponse.json({
          action,
          updated,
          errors,
          message: `Refreshed metadata for ${updated} tracks (${errors} errors)`,
        });
      }

      case "fetch-artwork": {
        try {
          const { stdout } = await execFileAsync("beet", ["fetchart", "-q"], {
            timeout: 300000,
          });
          return NextResponse.json({
            action,
            output: stdout,
            message: "Artwork fetch completed",
          });
        } catch (err) {
          return NextResponse.json({
            action,
            error: "beet fetchart failed — is Beets installed?",
            details: String(err),
          });
        }
      }

      case "rescan-covers": {
        const allTracks = db.select().from(tracks).all();
        const coversDir = path.join(process.cwd(), "public", "covers");
        if (!fs.existsSync(coversDir)) {
          fs.mkdirSync(coversDir, { recursive: true });
        }

        let extracted = 0;
        let skipped = 0;
        let errCount = 0;
        const seen = new Set<string>();

        for (const track of allTracks) {
          const albumKey = `${track.albumArtist || track.artist}|||${track.album}`;
          if (seen.has(albumKey)) {
            // Already extracted for this album, just update coverPath if needed
            if (!track.coverPath) {
              const hash = crypto.createHash("md5").update(track.album + track.artist).digest("hex");
              const coverFile = `${hash}.jpg`;
              if (fs.existsSync(path.join(coversDir, coverFile))) {
                db.update(tracks).set({ coverPath: `/covers/${coverFile}` }).where(sql`${tracks.id} = ${track.id}`).run();
              }
            }
            skipped++;
            continue;
          }
          seen.add(albumKey);

          try {
            fs.accessSync(track.filePath);
            const metadata = await parseFile(track.filePath);
            if (metadata.common.picture && metadata.common.picture.length > 0) {
              const pic = metadata.common.picture[0];
              const fmt = pic.format.replace("image/", "");
              const hash = crypto.createHash("md5").update(track.album + track.artist).digest("hex");
              const coverFilename = `${hash}.${fmt === "jpeg" ? "jpg" : fmt}`;
              const coverFullPath = path.join(coversDir, coverFilename);

              fs.writeFileSync(coverFullPath, pic.data);
              const coverPath = `/covers/${coverFilename}`;

              // Update all tracks for this album
              db.update(tracks)
                .set({ coverPath })
                .where(sql`(${tracks.album} = ${track.album} AND (${tracks.artist} = ${track.artist} OR ${tracks.albumArtist} = ${track.albumArtist}))`)
                .run();

              extracted++;
            }
          } catch {
            errCount++;
          }
        }

        return NextResponse.json({
          action,
          extracted,
          skipped,
          errors: errCount,
          message: `Extracted covers for ${extracted} albums (${skipped} tracks skipped, ${errCount} errors)`,
        });
      }

      case "merge-split-album": {
        const { album, primaryArtist } = body;
        if (!album || !primaryArtist) {
          return NextResponse.json(
            { error: "album and primaryArtist are required" },
            { status: 400 }
          );
        }
        const mergeResult = await mergeSplitAlbum(album, primaryArtist);
        return NextResponse.json({ action, ...mergeResult });
      }

      case "merge-all-split-albums": {
        // Detect all split albums, then merge each with suggested primary
        const detectRes = await fetch(
          `${process.env.VYNL_HOST || "http://localhost:3101"}/api/library/housekeeping/split-albums`
        );
        const { splitAlbums } = await detectRes.json();
        const results = [];

        for (const sa of splitAlbums || []) {
          const result = await mergeSplitAlbum(sa.album, sa.suggestedPrimary);
          results.push({ album: sa.album, primaryArtist: sa.suggestedPrimary, ...result });
        }

        return NextResponse.json({
          action,
          merged: results.length,
          results,
          message: `Merged ${results.filter((r: any) => r.merged).length} split albums`,
        });
      }

      case "detect-duplicate-formats": {
        const dupes = db.all(sql`
          SELECT t1.id as keep_id, t2.id as remove_id,
                 t1.title, t1.album,
                 t1.file_path as keep_path, t2.file_path as remove_path,
                 t1.file_size as keep_size, t2.file_size as remove_size
          FROM tracks t1
          JOIN tracks t2 ON t1.album = t2.album
            AND t1.track_number = t2.track_number
            AND t1.title = t2.title
            AND t1.id < t2.id
          WHERE (t1.file_path LIKE '%.m4a' AND t2.file_path LIKE '%.mp3')
             OR (t1.file_path LIKE '%.mp3' AND t2.file_path LIKE '%.m4a')
        `) as Array<{
          keep_id: number; remove_id: number; title: string; album: string;
          keep_path: string; remove_path: string; keep_size: number; remove_size: number;
        }>;

        // Normalize: always show m4a as "keep" candidate, mp3 as "remove" candidate
        const normalized = dupes.map((d) => {
          const keepIsM4a = d.keep_path.endsWith(".m4a");
          return {
            title: d.title,
            album: d.album,
            m4aId: keepIsM4a ? d.keep_id : d.remove_id,
            mp3Id: keepIsM4a ? d.remove_id : d.keep_id,
            m4aPath: keepIsM4a ? d.keep_path : d.remove_path,
            mp3Path: keepIsM4a ? d.remove_path : d.keep_path,
            m4aSize: keepIsM4a ? d.keep_size : d.remove_size,
            mp3Size: keepIsM4a ? d.remove_size : d.keep_size,
          };
        });

        return NextResponse.json({
          action,
          duplicates: normalized,
          count: normalized.length,
          message: `Found ${normalized.length} tracks with both .m4a and .mp3 formats`,
        });
      }

      case "clean-duplicate-formats": {
        const keepFormat = body.keep || "m4a";
        const removeExt = keepFormat === "m4a" ? ".mp3" : ".m4a";
        const keepExt = keepFormat === "m4a" ? ".m4a" : ".mp3";

        // Find all duplicate format pairs
        const formatDupes = db.all(sql`
          SELECT t1.id as id1, t2.id as id2,
                 t1.file_path as path1, t2.file_path as path2,
                 t1.file_size as size1, t2.file_size as size2
          FROM tracks t1
          JOIN tracks t2 ON t1.album = t2.album
            AND t1.track_number = t2.track_number
            AND t1.title = t2.title
            AND t1.id < t2.id
          WHERE (t1.file_path LIKE '%.m4a' AND t2.file_path LIKE '%.mp3')
             OR (t1.file_path LIKE '%.mp3' AND t2.file_path LIKE '%.m4a')
        `) as Array<{
          id1: number; id2: number; path1: string; path2: string;
          size1: number; size2: number;
        }>;

        let removed = 0;
        let freedBytes = 0;
        let errors = 0;

        for (const dup of formatDupes) {
          // Determine which to remove
          const removeId = dup.path1.endsWith(removeExt) ? dup.id1 : dup.id2;
          const removePath = dup.path1.endsWith(removeExt) ? dup.path1 : dup.path2;
          const removeSize = dup.path1.endsWith(removeExt) ? dup.size1 : dup.size2;

          try {
            // Delete file from disk
            if (fs.existsSync(removePath)) {
              fs.unlinkSync(removePath);
              freedBytes += removeSize || 0;
            }

            // Remove from Vynl DB
            db.run(sql`DELETE FROM tracks WHERE id = ${removeId}`);

            // Remove from beets DB
            try {
              const beetsDbPath = getBeetsDbPath();
              if (fs.existsSync(beetsDbPath)) {
                const beetsDb = new Database(beetsDbPath);
                beetsDb.prepare(`DELETE FROM items WHERE path = ?`).run(Buffer.from(removePath, "utf-8"));
                beetsDb.close();
              }
            } catch {
              // Non-fatal beets DB error
            }

            removed++;
          } catch {
            errors++;
          }
        }

        return NextResponse.json({
          action,
          removed,
          freedBytes,
          errors,
          message: `Removed ${removed} duplicate ${removeExt} files (freed ${(freedBytes / 1024 / 1024).toFixed(1)} MB)`,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use: clean-missing, refresh-metadata, fetch-artwork, rescan-covers, merge-split-album, merge-all-split-albums, detect-duplicate-formats, clean-duplicate-formats` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Housekeeping error:", err);
    return NextResponse.json(
      { error: "Housekeeping failed", details: String(err) },
      { status: 500 }
    );
  }
}
