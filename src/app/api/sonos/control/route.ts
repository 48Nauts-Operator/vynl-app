import { NextRequest, NextResponse } from "next/server";
import * as sonos from "@/lib/sonos";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { speaker, action, uri, spotifyUri, isRadio } = body;

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
