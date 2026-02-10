import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const filePath = "/" + pathSegments.join("/");

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".wav": "audio/wav",
    ".wma": "audio/x-ms-wma",
    ".aiff": "audio/aiff",
  };

  const quality = request.nextUrl.searchParams.get("quality");
  const download = request.nextUrl.searchParams.get("download");

  // Mobile transcoding: FLAC/WAV/AIFF → AAC 256kbps
  if (quality === "mobile" && [".flac", ".wav", ".aiff", ".alac"].includes(ext)) {
    try {
      const transcoded = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const ffmpeg = execFile(
          "ffmpeg",
          [
            "-i", filePath,
            "-c:a", "aac",
            "-b:a", "256k",
            "-f", "adts",
            "-movflags", "+faststart",
            "pipe:1",
          ],
          { maxBuffer: 100 * 1024 * 1024 },
          (err, stdout) => {
            if (err) reject(err);
          }
        );

        ffmpeg.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
        ffmpeg.stdout?.on("end", () => resolve(Buffer.concat(chunks)));
        ffmpeg.on("error", reject);
      });

      const headers: Record<string, string> = {
        "Content-Length": transcoded.length.toString(),
        "Content-Type": "audio/aac",
        "Accept-Ranges": "none",
      };

      if (download) {
        const basename = path.basename(filePath, ext);
        headers["Content-Disposition"] = `attachment; filename="${basename}.aac"`;
      }

      return new Response(new Uint8Array(transcoded), { headers });
    } catch (err) {
      console.error("Transcoding failed, serving original:", err);
      // Fall through to serve original
    }
  }

  const contentType = mimeTypes[ext] || "application/octet-stream";
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
  };

  if (download) {
    baseHeaders["Content-Disposition"] = `attachment; filename="${path.basename(filePath)}"`;
  }

  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const stream = fs.createReadStream(filePath, { start, end });
    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(readable, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunkSize.toString(),
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  const readable = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(readable, {
    headers: {
      ...baseHeaders,
      "Content-Length": fileSize.toString(),
    },
  });
}
