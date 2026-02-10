import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trackIds } = body;

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return NextResponse.json(
        { error: "trackIds array is required" },
        { status: 400 }
      );
    }

    if (trackIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 tracks per download" },
        { status: 400 }
      );
    }

    // For a single track, return the file directly
    if (trackIds.length === 1) {
      const sqlite = (db as any).session?.client || (db as any).$client;
      const track = sqlite
        .prepare("SELECT * FROM tracks WHERE id = ?")
        .get(trackIds[0]);

      if (!track || !fs.existsSync(track.file_path)) {
        return NextResponse.json(
          { error: "Track not found" },
          { status: 404 }
        );
      }

      const fileBuffer = fs.readFileSync(track.file_path);
      const ext = path.extname(track.file_path);
      const filename = `${track.artist} - ${track.title}${ext}`.replace(
        /[/\\?%*:|"<>]/g,
        "_"
      );

      return new Response(fileBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": fileBuffer.length.toString(),
        },
      });
    }

    // For multiple tracks, create a simple tar-like concatenation isn't ideal.
    // Return metadata for now — a proper zip requires streaming.
    const sqlite = (db as any).session?.client || (db as any).$client;
    const placeholders = trackIds.map(() => "?").join(",");
    const foundTracks = sqlite
      .prepare(`SELECT id, title, artist, file_path, format FROM tracks WHERE id IN (${placeholders})`)
      .all(...trackIds);

    const downloadLinks = foundTracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      url: `/api/audio${t.file_path}`,
      format: t.format,
    }));

    return NextResponse.json({
      tracks: downloadLinks,
      message: "Use individual track URLs to download. Batch zip coming soon.",
    });
  } catch (err) {
    console.error("Download error:", err);
    return NextResponse.json(
      { error: "Download failed", details: String(err) },
      { status: 500 }
    );
  }
}
