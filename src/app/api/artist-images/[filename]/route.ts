/**
 * Serve artist images from /app/public/artists/.
 *
 * Same workaround as /api/covers/[filename] — Next.js standalone mode
 * doesn't re-scan public/ for files added at runtime. The artist-image
 * downloader (src/app/api/artists/[name]/intel/route.ts) writes to
 * public/artists/ on demand, so those need a runtime-read API path.
 */
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Same cwd-based default as /api/covers — works in both Docker and
// `npm run dev` without an env var override.
const ARTISTS_DIR =
  process.env.VYNL_ARTISTS_DIR ||
  path.join(process.cwd(), "public", "artists");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> }
) {
  const { filename } = await ctx.params;
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return NextResponse.json({ error: "invalid filename" }, { status: 400 });
  }

  const filePath = path.join(ARTISTS_DIR, filename);
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
