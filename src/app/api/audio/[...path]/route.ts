import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { execFile, spawn } from "child_process";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  let filePath = "/" + pathSegments.join("/");

  // Apply path remap (e.g. old DB entries with /Volumes/Music-1 → /Volumes/Music)
  const pathRemap = process.env.BEETS_PATH_REMAP;
  if (pathRemap) {
    const [remapFrom, remapTo] = pathRemap.split("::");
    if (remapFrom && remapTo && filePath.startsWith(remapFrom + "/")) {
      filePath = remapTo + filePath.slice(remapFrom.length);
    }
  }

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
  const sonosMode = request.nextUrl.searchParams.get("sonos") === "1";

  // Sonos transcoding: FLAC/WAV/AIFF → MP3 320kbps via cached temp files
  // Transcodes once per file, then serves with proper Content-Length for Sonos UPnP
  if (sonosMode && [".flac", ".wav", ".aiff", ".alac"].includes(ext)) {
    const cacheDir = path.join(os.tmpdir(), "vynl-sonos-cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Cache key: hash of file path + modification time (re-transcode if source changes)
    const cacheKey = crypto
      .createHash("md5")
      .update(`${filePath}:${stat.mtimeMs}`)
      .digest("hex");
    const cachePath = path.join(cacheDir, `${cacheKey}.mp3`);

    // Transcode if not cached
    if (!fs.existsSync(cachePath)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const ffmpeg = spawn("ffmpeg", [
            "-i", filePath,
            "-c:a", "libmp3lame",
            "-b:a", "320k",
            "-y",
            cachePath,
          ]);
          ffmpeg.stderr.on("data", () => {}); // consume stderr to prevent blocking
          ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
          });
          ffmpeg.on("error", reject);
        });
      } catch (err) {
        console.error("Sonos transcoding failed, serving original:", err);
        // Clean up partial cache file
        try { fs.unlinkSync(cachePath); } catch {}
        // Fall through to serve original FLAC
      }
    }

    // Serve cached MP3 if it exists
    if (fs.existsSync(cachePath)) {
      const cachedStat = fs.statSync(cachePath);
      const cachedSize = cachedStat.size;
      const mp3Headers: Record<string, string> = {
        "Content-Type": "audio/mpeg",
        "Accept-Ranges": "bytes",
      };

      // Support range requests (Sonos uses these for seeking)
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : cachedSize - 1;
        const chunkSize = end - start + 1;

        const cacheStream = fs.createReadStream(cachePath, { start, end });
        const cacheReadable = new ReadableStream({
          start(controller) {
            cacheStream.on("data", (chunk) => controller.enqueue(chunk));
            cacheStream.on("end", () => controller.close());
            cacheStream.on("error", (err) => controller.error(err));
          },
          cancel() { cacheStream.destroy(); },
        });

        return new Response(cacheReadable, {
          status: 206,
          headers: {
            ...mp3Headers,
            "Content-Range": `bytes ${start}-${end}/${cachedSize}`,
            "Content-Length": chunkSize.toString(),
          },
        });
      }

      const cacheStream = fs.createReadStream(cachePath);
      const cacheReadable = new ReadableStream({
        start(controller) {
          cacheStream.on("data", (chunk) => controller.enqueue(chunk));
          cacheStream.on("end", () => controller.close());
          cacheStream.on("error", (err) => controller.error(err));
        },
        cancel() { cacheStream.destroy(); },
      });

      return new Response(cacheReadable, {
        headers: {
          ...mp3Headers,
          "Content-Length": cachedSize.toString(),
        },
      });
    }
  }

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
