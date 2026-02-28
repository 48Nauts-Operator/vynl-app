import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";

// Returns a map of track_id → file_path for cross-instance ID resolution
export async function GET() {
  try {
    const allTracks = db.select({ id: tracks.id, filePath: tracks.filePath }).from(tracks).all();
    const map: Record<string, string> = {};
    for (const t of allTracks) {
      map[String(t.id)] = t.filePath;
    }
    return NextResponse.json(map);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to build track map", details: String(err) },
      { status: 500 }
    );
  }
}
