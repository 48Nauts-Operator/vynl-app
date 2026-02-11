import { NextRequest, NextResponse } from "next/server";
import {
  getCachedLyrics,
  saveLyrics,
  fetchEmbeddedLyrics,
  fetchFromLRCLIB,
  parseLRC,
} from "@/lib/lyrics";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const trackId = parseInt(params.get("trackId") || "0");
  const artist = params.get("artist") || "";
  const title = params.get("title") || "";
  const album = params.get("album") || "";
  const filePath = params.get("filePath") || "";
  const duration = parseFloat(params.get("duration") || "0");

  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }

  // 1. Check cache
  const cached = getCachedLyrics(trackId);
  if (cached) {
    return NextResponse.json(cached);
  }

  // 2. Try embedded lyrics from file metadata
  if (filePath) {
    const embedded = await fetchEmbeddedLyrics(filePath);
    if (embedded.syncedLyrics) {
      saveLyrics(trackId, embedded.syncedLyrics, "lrc", "embedded");
      return NextResponse.json({
        content: embedded.syncedLyrics,
        format: "lrc",
        source: "embedded",
        lines: parseLRC(embedded.syncedLyrics),
      });
    }
    if (embedded.plainLyrics) {
      saveLyrics(trackId, embedded.plainLyrics, "plain", "embedded");
      return NextResponse.json({
        content: embedded.plainLyrics,
        format: "plain",
        source: "embedded",
      });
    }
  }

  // 3. Try LRCLIB
  if (artist && title) {
    const lrclib = await fetchFromLRCLIB(artist, title, album, duration || undefined);
    if (lrclib?.syncedLyrics) {
      saveLyrics(trackId, lrclib.syncedLyrics, "lrc", "lrclib");
      return NextResponse.json({
        content: lrclib.syncedLyrics,
        format: "lrc",
        source: "lrclib",
        lines: parseLRC(lrclib.syncedLyrics),
      });
    }
    if (lrclib?.plainLyrics) {
      saveLyrics(trackId, lrclib.plainLyrics, "plain", "lrclib");
      return NextResponse.json({
        content: lrclib.plainLyrics,
        format: "plain",
        source: "lrclib",
      });
    }
  }

  // 4. No lyrics found
  return NextResponse.json({ content: null, format: null, source: null });
}
