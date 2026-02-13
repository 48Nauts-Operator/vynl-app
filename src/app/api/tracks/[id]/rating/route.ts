import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackRatings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) {
    return NextResponse.json({ error: "Invalid track ID" }, { status: 400 });
  }

  const row = db
    .select({ rating: trackRatings.rating })
    .from(trackRatings)
    .where(eq(trackRatings.trackId, trackId))
    .get();

  return NextResponse.json({ rating: row?.rating ?? null });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) {
    return NextResponse.json({ error: "Invalid track ID" }, { status: 400 });
  }

  const body = await req.json();
  const rating = body.rating;
  if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json({ error: "Rating must be integer 1-5" }, { status: 400 });
  }

  // Upsert: insert or update on conflict
  db.insert(trackRatings)
    .values({ trackId, rating })
    .onConflictDoUpdate({
      target: trackRatings.trackId,
      set: { rating, ratedAt: new Date().toISOString().replace("T", " ").slice(0, 19) },
    })
    .run();

  return NextResponse.json({ trackId, rating });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (isNaN(trackId)) {
    return NextResponse.json({ error: "Invalid track ID" }, { status: 400 });
  }

  db.delete(trackRatings).where(eq(trackRatings.trackId, trackId)).run();

  return NextResponse.json({ trackId, rating: null });
}
