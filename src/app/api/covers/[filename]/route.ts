/**
 * Serve album covers from /app/public/covers/.
 *
 * Why this route exists: Next.js in `output: "standalone"` mode caches its
 * public/ directory listing at server start. Files written to public/covers/
 * at runtime (via /api/albums/cover-update) physically exist on disk but
 * return 404 from the static handler. This API route reads the file directly
 * and streams it back, bypassing the static layer entirely.
 *
 * cover_path in the DB is /api/covers/<filename> for new covers. Old rows
 * using /covers/<filename> are rewritten by a one-time migration in
 * src/lib/db/index.ts.
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const COVERS_DIR = process.env.VYNL_COVERS_DIR || "/app/public/covers";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> }
) {
  const { filename } = await ctx.params;

  // Hash-based filenames only (a-f, 0-9, plus extension). Reject anything
  // with path traversal characters.
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return NextResponse.json({ error: "invalid filename" }, { status: 400 });
  }

  const filePath = path.join(COVERS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
