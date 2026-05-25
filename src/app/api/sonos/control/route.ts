import { NextRequest, NextResponse } from "next/server";
import * as sonos from "@/lib/sonos";

/**
 * Resolve the base URL Sonos speakers should use to fetch audio.
 * Read at request time (runtime, not build-time) so:
 *   - VYNL_HOST / NEXT_PUBLIC_VYNL_HOST env vars take effect on container
 *     restart without needing a fresh image build (NEXT_PUBLIC_* is normally
 *     baked into the client bundle at `next build` time and is undefined in
 *     the browser unless passed as a Docker build arg — which we don't).
 *   - When env is unset, fall back to the Host header of the incoming
 *     request, which is the LAN/Tailscale URL the browser used to reach
 *     us. The speaker can reach whatever the browser reached if they share
 *     the same network.
 */
function resolveSonosAudioBase(request: NextRequest): string {
  const env = process.env.VYNL_HOST || process.env.NEXT_PUBLIC_VYNL_HOST;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3101";
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { speaker, action, uri, spotifyUri, isRadio, filePath, isLossless } = body;

  if (!speaker) {
    return NextResponse.json({ error: "Speaker name required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "play":
        await sonos.play(speaker);
        break;
      case "pause":
        await sonos.pause(speaker);
        break;
      case "next":
        await sonos.next(speaker);
        break;
      case "previous":
        await sonos.prev(speaker);
        break;
      case "play-uri":
        if (!uri) return NextResponse.json({ error: "URI required" }, { status: 400 });
        await sonos.playUri(speaker, uri, isRadio);
        break;
      case "play-file": {
        // Compose the audio URL server-side so it's always reachable from
        // whatever network the request came from — never leaks a Tailscale
        // URL the speaker can't fetch.
        if (!filePath || typeof filePath !== "string") {
          return NextResponse.json({ error: "filePath required" }, { status: 400 });
        }
        const base = resolveSonosAudioBase(request);
        const encoded = filePath
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/");
        // Lossless: rewrite extension to .mp3 so Sonos accepts protocolInfo=audio/mpeg;
        // the audio route resolves the .mp3 back to the source file + transcodes.
        const sonosEncoded = isLossless
          ? encoded.replace(/\.(flac|wav|aiff|alac)$/i, ".mp3")
          : encoded;
        const sonosParam = isLossless ? "?sonos=1" : "";
        const builtUri = `${base}/api/audio${sonosEncoded}${sonosParam}`;
        await sonos.playUri(speaker, builtUri, false);
        break;
      }
      case "open-spotify":
        if (!spotifyUri) return NextResponse.json({ error: "Spotify URI required" }, { status: 400 });
        await sonos.openSpotify(speaker, spotifyUri);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`Sonos control error [${action}] speaker="${speaker}":`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
