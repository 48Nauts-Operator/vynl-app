import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcastEpisodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST — save play position
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  const { episodeId } = await params;
  const epId = parseInt(episodeId);

  const body = await request.json();
  const { position } = body;

  if (typeof position !== "number") {
    return NextResponse.json({ error: "position is required" }, { status: 400 });
  }

  db.update(podcastEpisodes)
    .set({
      playPosition: position,
      listenedAt: new Date().toISOString(),
    })
    .where(eq(podcastEpisodes.id, epId))
    .run();

  return NextResponse.json({ success: true });
}
