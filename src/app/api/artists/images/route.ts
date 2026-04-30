import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { artistIntel } from "@/lib/db/schema";

/** Returns a map of artist names to their local image paths */
export async function GET() {
  const rows = db
    .select({
      artistName: artistIntel.artistName,
      localImagePath: artistIntel.localImagePath,
      imageUrl: artistIntel.imageUrl,
    })
    .from(artistIntel)
    .all();

  const images: Record<string, string> = {};
  for (const row of rows) {
    if (row.localImagePath || row.imageUrl) {
      images[row.artistName] = row.localImagePath || row.imageUrl || "";
    }
  }

  return NextResponse.json(images);
}
