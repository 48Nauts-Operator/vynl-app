import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { applyModify } from "@/lib/beets-doctor/apply";
import { beetsaiActions } from "@/lib/db/schema";

export const maxDuration = 60;
export const runtime = "nodejs";

// POST /api/tracks/[id]/apply-match
//   Body: { match: IdentifyMatch }
//
// Applies the chosen identification candidate to the track via the
// same 3-layer atomic apply we use everywhere else (beets DB ->
// file tags -> Vynl tracks). Logs to beetsaiActions with
// source="identify".
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const trackId = parseInt(id, 10);
  if (!Number.isFinite(trackId)) {
    return NextResponse.json({ error: "invalid track id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const match: {
    title?: string;
    artist?: string;
    album?: string | null;
    year?: number | null;
    recordingId?: string | null;
    source?: string;
    score?: number;
  } = body.match || {};

  const track = db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!track) {
    return NextResponse.json({ error: "track not found" }, { status: 404 });
  }

  // Build the modify args. We key the beets query on the track id to
  // avoid any ambiguity from title/artist text matching.
  const beetsItemQuery = `id:${trackId}`;
  const args = ["modify", "-y", beetsItemQuery];
  if (match.title) args.push(`title=${match.title}`);
  if (match.artist) args.push(`artist=${match.artist}`);
  if (match.album) args.push(`album=${match.album}`);
  if (match.year) args.push(`year=${match.year}`);
  if (match.recordingId) args.push(`mb_trackid=${match.recordingId}`);

  if (args.length === 3) {
    return NextResponse.json(
      { error: "match payload has no fields to apply" },
      { status: 400 }
    );
  }

  const result = await applyModify(args, track.album);
  if (!result.success) {
    return NextResponse.json(
      {
        error: result.error || "apply failed",
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      },
      { status: 500 }
    );
  }

  // Audit row — same shape as Doctor auto-applies.
  db.insert(beetsaiActions)
    .values({
      issueType: "identify",
      albumName: track.album,
      albumArtist: track.albumArtist,
      beetsCommand: `beet ${args.join(" ")}`,
      beetsArgs: JSON.stringify(args),
      before: JSON.stringify(result.before || {}),
      after: JSON.stringify(result.after || {}),
      source: "identify",
      confidence: match.score ?? null,
      llmModel: match.source || "external",
      reasoning: `Matched via ${match.source || "external"}: "${match.title}" by ${match.artist}`,
      status: "applied",
    })
    .run();

  return NextResponse.json({
    success: true,
    appliedFields: args.slice(3),
    before: result.before,
    after: result.after,
    vynlRowsUpdated: result.vynlRowsUpdated,
    stdout: result.stdout,
  });
}
