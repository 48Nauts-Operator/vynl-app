import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { artistIntel } from "@/lib/db/schema";
import { isAuthenticated } from "@/lib/auth";

/** Returns a map of artist names to their local image paths */
export async function GET(request: NextRequest) {
  // Authorization check (defense-in-depth; also enforced by middleware)
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      const resolved = row.localImagePath || row.imageUrl || "";
      // Only include paths within the expected artist-image scope —
      // /api/artist-images/ is the live runtime route, /artists/ is the
      // legacy static path (still valid for files baked at build time).
      if (
        resolved &&
        (resolved.startsWith("/api/artist-images/") ||
          resolved.startsWith("/artists/"))
      ) {
        images[row.artistName] = resolved;
      } else if (resolved && resolved.startsWith("http")) {
        // External URLs are safe to return
        images[row.artistName] = resolved;
      }
      // Otherwise omit — path is outside expected scope
    }
  }

  return NextResponse.json(images);
}
