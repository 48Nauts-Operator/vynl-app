import { NextResponse } from "next/server";
import * as sonos from "@/lib/sonos";

export async function GET() {
  try {
    const speakers = await sonos.discover();
    return NextResponse.json({ speakers });
  } catch (err) {
    return NextResponse.json(
      { speakers: [], error: String(err) },
      { status: 200 }
    );
  }
}
