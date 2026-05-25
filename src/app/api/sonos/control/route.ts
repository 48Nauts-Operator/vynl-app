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
  const t0 = Date.now();
  const reqId = Math.random().toString(36).slice(2, 8);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch (err) {
    console.error(`[sonos ${reqId}] BAD JSON BODY:`, err);
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { speaker, action, uri, spotifyUri, isRadio, filePath, isLossless } =
    body as {
      speaker?: string;
      action?: string;
      uri?: string;
      spotifyUri?: string;
      isRadio?: boolean;
      filePath?: string;
      isLossless?: boolean;
    };

  // Log every incoming request — previously a 4xx silently dropped with no
  // log entry, which made it impossible to tell from `docker logs` whether
  // the browser was even talking to the server.
  console.log(
    `[sonos ${reqId}] IN  action=${action ?? "<none>"} speaker=${speaker ?? "<none>"} ` +
      `keys=${Object.keys(body).join(",")} host=${request.headers.get("host")}`
  );

  if (!speaker) {
    console.warn(`[sonos ${reqId}] REJECT: missing speaker`);
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
        if (!uri) {
          console.warn(`[sonos ${reqId}] REJECT: play-uri missing uri`);
          return NextResponse.json({ error: "URI required" }, { status: 400 });
        }
        console.log(`[sonos ${reqId}] play-uri uri=${uri} isRadio=${isRadio ?? false}`);
        await sonos.playUri(speaker, uri, isRadio);
        break;
      case "play-file": {
        if (!filePath || typeof filePath !== "string") {
          console.warn(`[sonos ${reqId}] REJECT: play-file missing filePath`);
          return NextResponse.json({ error: "filePath required" }, { status: 400 });
        }
        const base = resolveSonosAudioBase(request);
        const encoded = filePath
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/");
        const sonosEncoded = isLossless
          ? encoded.replace(/\.(flac|wav|aiff|alac)$/i, ".mp3")
          : encoded;
        const sonosParam = isLossless ? "?sonos=1" : "";
        const builtUri = `${base}/api/audio${sonosEncoded}${sonosParam}`;
        console.log(
          `[sonos ${reqId}] play-file base=${base} isLossless=${!!isLossless} ` +
            `filePath=${filePath} -> uri=${builtUri}`
        );
        await sonos.playUri(speaker, builtUri, false);
        break;
      }
      case "open-spotify":
        if (!spotifyUri) {
          console.warn(`[sonos ${reqId}] REJECT: open-spotify missing spotifyUri`);
          return NextResponse.json({ error: "Spotify URI required" }, { status: 400 });
        }
        console.log(`[sonos ${reqId}] open-spotify uri=${spotifyUri}`);
        await sonos.openSpotify(speaker, spotifyUri);
        break;
      default:
        console.warn(`[sonos ${reqId}] REJECT: unknown action="${action}"`);
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const ms = Date.now() - t0;
    console.log(`[sonos ${reqId}] OK  action=${action} speaker=${speaker} ${ms}ms`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const ms = Date.now() - t0;
    const errStr = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      `[sonos ${reqId}] FAIL action=${action} speaker="${speaker}" ${ms}ms err=${errStr}`
    );
    if (err && typeof err === "object" && "stack" in err) {
      console.error((err as Error).stack);
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
