import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/spotify";
import crypto from "crypto";

export async function GET() {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const url = getAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to start Spotify auth", details: String(err) },
      { status: 500 }
    );
  }
}
