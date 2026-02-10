import { NextRequest, NextResponse } from "next/server";
import * as sonos from "@/lib/sonos";

export async function GET(request: NextRequest) {
  const speaker = request.nextUrl.searchParams.get("speaker");
  if (!speaker) {
    return NextResponse.json({ error: "Speaker required" }, { status: 400 });
  }
  try {
    const volume = await sonos.getVolume(speaker);
    return NextResponse.json({ volume });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { speaker, volume } = await request.json();
  if (!speaker || volume === undefined) {
    return NextResponse.json({ error: "Speaker and volume required" }, { status: 400 });
  }
  try {
    await sonos.setVolume(speaker, volume);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
