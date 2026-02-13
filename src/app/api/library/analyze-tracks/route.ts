// [VynlDJ] — extractable: Track analysis background job API
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tracks, trackAudioFeatures } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import {
  runFullAnalysis,
  getAnalysisJob,
  cancelAnalysisJob,
} from "@/lib/audio-analysis";

// GET — poll job status
export async function GET() {
  const job = getAnalysisJob();

  // Also fetch DB counts for display
  const [totalResult] = db.select({ c: count() }).from(tracks).all();
  const [analyzedResult] = db.select({ c: count() }).from(trackAudioFeatures).all();

  if (!job || job.status !== "running") {
    return NextResponse.json({
      status: job?.status ?? "idle",
      phase: job?.phase ?? null,
      processed: job?.processed ?? 0,
      total: job?.total ?? 0,
      enriched: job?.enriched ?? 0,
      errors: job?.errors ?? 0,
      totalTracks: totalResult.c,
      analyzedTracks: analyzedResult.c,
    });
  }

  return NextResponse.json({
    status: job.status,
    phase: job.phase,
    processed: job.processed,
    total: job.total,
    enriched: job.enriched,
    errors: job.errors,
    totalTracks: totalResult.c,
    analyzedTracks: analyzedResult.c,
  });
}

// POST — start analysis job
export async function POST() {
  const existingJob = getAnalysisJob();
  if (existingJob?.status === "running") {
    return NextResponse.json(
      { error: "Analysis already running", status: "running" },
      { status: 409 }
    );
  }

  // Fire and forget
  runFullAnalysis().catch((err) => {
    console.error("Analysis job failed:", err);
  });

  return NextResponse.json({ status: "started" });
}

// DELETE — cancel running job
export async function DELETE() {
  cancelAnalysisJob();
  return NextResponse.json({ status: "cancelling" });
}
