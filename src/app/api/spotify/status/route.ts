import { NextResponse } from "next/server";
import { getAuthStatus, disconnect } from "@/lib/spotify";

/** GET — check if Spotify is connected */
export async function GET() {
  const status = getAuthStatus();
  return NextResponse.json(status);
}

/** DELETE — disconnect Spotify */
export async function DELETE() {
  disconnect();
  return NextResponse.json({ disconnected: true });
}
