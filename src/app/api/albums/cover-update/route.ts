import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { album, albumArtist, imageUrl } = await request.json();

    if (!album || !imageUrl) {
      return NextResponse.json(
        { error: "album and imageUrl are required" },
        { status: 400 }
      );
    }

    // Download the image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Failed to download image" }, { status: 502 });
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Save to public/covers/
    const coversDir = path.join(process.cwd(), "public", "covers");
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }

    const hash = crypto.createHash("md5").update(album + (albumArtist || "")).digest("hex");
    const filename = `${hash}.${ext}`;
    fs.writeFileSync(path.join(coversDir, filename), buffer);

    const coverPath = `/covers/${filename}`;

    // Update all tracks for this album
    if (albumArtist) {
      db.update(tracks)
        .set({ coverPath })
        .where(sql`${tracks.album} = ${album} AND (${tracks.albumArtist} = ${albumArtist} OR ${tracks.artist} = ${albumArtist})`)
        .run();
    } else {
      db.update(tracks)
        .set({ coverPath })
        .where(sql`${tracks.album} = ${album}`)
        .run();
    }

    return NextResponse.json({ coverPath, updated: true });
  } catch (err) {
    return NextResponse.json({ error: "Cover update failed", details: String(err) }, { status: 500 });
  }
}
