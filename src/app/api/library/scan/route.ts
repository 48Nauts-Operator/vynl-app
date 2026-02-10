import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { FilesystemAdapter } from "@/lib/adapters/filesystem-adapter";
import { BeetsAdapter } from "@/lib/adapters/beets-adapter";
import { MusicSourceAdapter } from "@/lib/adapters/types";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export async function POST(request: NextRequest) {
  const libraryPath = process.env.MUSIC_LIBRARY_PATH;
  if (!libraryPath) {
    return NextResponse.json(
      { error: "MUSIC_LIBRARY_PATH not configured" },
      { status: 400 }
    );
  }

  const adapterParam = request.nextUrl.searchParams.get("adapter");

  try {
    // Select adapter
    let adapter: MusicSourceAdapter;
    const beetsAdapter = new BeetsAdapter();
    const fsAdapter = new FilesystemAdapter();

    if (adapterParam === "beets") {
      adapter = beetsAdapter;
    } else if (adapterParam === "filesystem") {
      adapter = fsAdapter;
    } else {
      // Auto-detect: prefer Beets if available
      adapter = (await beetsAdapter.isAvailable()) ? beetsAdapter : fsAdapter;
    }

    let scanned = 0;
    let added = 0;
    let errors = 0;

    const coversDir = path.join(process.cwd(), "public", "covers");
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }

    for await (const track of adapter.scan(libraryPath)) {
      scanned++;

      try {
        // Save cover art if present
        let coverPath: string | undefined;
        if (track.coverData) {
          const hash = crypto
            .createHash("md5")
            .update(track.album + track.artist)
            .digest("hex");
          const coverFilename = `${hash}.${track.coverData.format === "jpeg" ? "jpg" : track.coverData.format}`;
          const coverFullPath = path.join(coversDir, coverFilename);

          if (!fs.existsSync(coverFullPath)) {
            fs.writeFileSync(coverFullPath, track.coverData.data);
          }
          coverPath = `/covers/${coverFilename}`;
        }

        db.insert(tracks)
          .values({
            title: track.title,
            artist: track.artist,
            album: track.album,
            albumArtist: track.albumArtist,
            genre: track.genre,
            year: track.year,
            trackNumber: track.trackNumber,
            discNumber: track.discNumber,
            duration: track.duration,
            filePath: track.filePath,
            fileSize: track.fileSize,
            format: track.format,
            bitrate: track.bitrate,
            sampleRate: track.sampleRate,
            coverPath,
            source: "local",
          })
          .onConflictDoUpdate({
            target: tracks.filePath,
            set: {
              title: track.title,
              artist: track.artist,
              album: track.album,
              albumArtist: track.albumArtist,
              genre: track.genre,
              year: track.year,
              trackNumber: track.trackNumber,
              discNumber: track.discNumber,
              duration: track.duration,
              fileSize: track.fileSize,
              format: track.format,
              bitrate: track.bitrate,
              sampleRate: track.sampleRate,
              coverPath,
            },
          })
          .run();

        added++;
      } catch (err) {
        errors++;
        console.error(`Error inserting track:`, err);
      }
    }

    return NextResponse.json({ adapter: adapter.name, scanned, added, errors });
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json(
      { error: "Scan failed", details: String(err) },
      { status: 500 }
    );
  }
}
