import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks, albumRules } from "@/lib/db/schema";
import { FilesystemAdapter } from "@/lib/adapters/filesystem-adapter";
import { BeetsAdapter } from "@/lib/adapters/beets-adapter";
import { MusicSourceAdapter } from "@/lib/adapters/types";
import { reconcileWishlist } from "@/lib/wishlist-reconciler";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Map from DB column name (as stored in tracks.user_overridden_fields)
// to the camelCase Drizzle key used in the upsert object. Used to skip
// fields the user has manually edited so beets/scan never overwrites.
const OVERRIDE_DB_TO_DRIZZLE: Record<string, string> = {
  title: "title",
  artist: "artist",
  album: "album",
  album_artist: "albumArtist",
  genre: "genre",
  year: "year",
};

function parseOverrides(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((s) => typeof s === "string" && s in OVERRIDE_DB_TO_DRIZZLE)
        .map((s) => OVERRIDE_DB_TO_DRIZZLE[s])
    );
  } catch {
    return new Set();
  }
}

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

    // Load album rules for pattern matching
    const rules = db.select().from(albumRules).all();
    const compiledRules = rules.map((r) => ({
      regex: new RegExp(r.pattern, "i"),
      targetAlbum: r.targetAlbum,
      targetAlbumArtist: r.targetAlbumArtist,
    }));

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
        // Apply album rules (e.g., merge "ASOT 950" → "A State of Trance")
        for (const rule of compiledRules) {
          if (rule.regex.test(track.album)) {
            track.album = rule.targetAlbum;
            if (rule.targetAlbumArtist) {
              // Always override albumArtist to normalize capitalization/spelling
              track.albumArtist = rule.targetAlbumArtist;
              // Also fix artist if it's missing/unknown
              if (!track.artist || track.artist === "Unknown Artist") {
                track.artist = rule.targetAlbumArtist;
              }
            }
            break;
          }
        }

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
          coverPath = `/api/covers/${coverFilename}`;
        }

        // Pre-fetch existing row (if any) to see which fields the user
        // has manually overridden. Adds one SELECT per upsert; for 15K
        // tracks ~3-4s of extra time on a full rescan, worth it to
        // preserve user edits per task #94.
        const existing = db
          .select({ overrides: tracks.userOverriddenFields })
          .from(tracks)
          .where(eq(tracks.filePath, track.filePath))
          .get();
        const overrides = parseOverrides(existing?.overrides);

        // Build the UPDATE set object, skipping any field the user has
        // edited manually. The INSERT branch always writes everything —
        // it's a brand-new row, no overrides to preserve.
        type UpdateSet = Record<string, unknown>;
        const baseUpdate: UpdateSet = {
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
          isrc: track.isrc,
          isCompilation: track.isCompilation ?? false,
          coverPath,
        };
        const filteredUpdate: UpdateSet = {};
        for (const [k, v] of Object.entries(baseUpdate)) {
          if (overrides.has(k)) continue;
          filteredUpdate[k] = v;
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
            isrc: track.isrc,
            isCompilation: track.isCompilation ?? false,
            coverPath,
            source: "local",
          })
          .onConflictDoUpdate({
            target: tracks.filePath,
            // Drizzle's set type is the full track row shape; we're passing
            // a filtered subset which is structurally valid at runtime.
            set: filteredUpdate as never,
          })
          .run();

        added++;
      } catch (err) {
        errors++;
        console.error(`Error inserting track:`, err);
      }
    }

    // Post-scan: detect compilations
    // An album is a compilation if it has 4+ distinct album_artists (or track artists)
    // and album_artist isn't already "Various Artists"
    let compilationsFixed = 0;
    try {
      const sqlite = (db as any).session?.client || (db as any).$client;
      const compAlbums = sqlite.prepare(`
        SELECT album,
               COUNT(DISTINCT COALESCE(album_artist, artist)) as aa_count,
               COUNT(DISTINCT artist) as artist_count
        FROM tracks
        WHERE source = 'local'
          AND album != 'Unknown Album' AND album != ''
          AND COALESCE(album_artist, '') != 'Various Artists'
        GROUP BY album
        HAVING COUNT(DISTINCT COALESCE(album_artist, artist)) >= 4
            OR COUNT(DISTINCT artist) >= 4
      `).all() as { album: string; aa_count: number; artist_count: number }[];

      for (const ca of compAlbums) {
        sqlite.prepare(
          `UPDATE tracks SET album_artist = 'Various Artists' WHERE album = ? AND source = 'local'`
        ).run(ca.album);
        compilationsFixed++;
      }
    } catch (err) {
      console.error("Compilation detection error:", err);
    }

    // Post-scan: reconcile wishlist
    let wishlistReconciled = 0;
    try {
      const reconcileResult = reconcileWishlist();
      wishlistReconciled = reconcileResult.matched;
    } catch (err) {
      console.error("Wishlist reconciliation error:", err);
    }

    return NextResponse.json({ adapter: adapter.name, scanned, added, errors, compilationsFixed, wishlistReconciled });
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json(
      { error: "Scan failed", details: String(err) },
      { status: 500 }
    );
  }
}
