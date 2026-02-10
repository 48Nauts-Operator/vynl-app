import { NextRequest, NextResponse } from "next/server";
import * as sonos from "@/lib/sonos";

export async function GET(request: NextRequest) {
  const speaker = request.nextUrl.searchParams.get("speaker") || undefined;
  try {
    const result = await sonos.status(speaker);
    return NextResponse.json(result || { state: "unknown" });
  } catch (err) {
    return NextResponse.json({ state: "error", error: String(err) });
  }
}
