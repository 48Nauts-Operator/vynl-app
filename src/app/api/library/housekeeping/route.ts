import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import { parseFile } from "music-metadata";

const execFileAsync = promisify(execFile);

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

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use: clean-missing, refresh-metadata, fetch-artwork` },
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
