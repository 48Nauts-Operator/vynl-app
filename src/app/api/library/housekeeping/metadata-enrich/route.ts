import { NextResponse } from "next/server";
import {
  startEnrichment,
  getEnrichmentStatus,
  cancelEnrichment,
  getMetadataGaps,
} from "@/lib/metadata-enrichment";

// GET — poll status + gap counts
export async function GET() {
  const job = getEnrichmentStatus();
  const gaps = getMetadataGaps();
  return NextResponse.json({ job, gaps });
}

// POST — start enrichment
export async function POST() {
  const existing = getEnrichmentStatus();
  if (existing?.status === "running") {
    return NextResponse.json(
      { error: "Enrichment already running" },
      { status: 409 }
    );
  }
  await startEnrichment();
  return NextResponse.json({ started: true });
}

// DELETE — cancel enrichment
export async function DELETE() {
  cancelEnrichment();
  return NextResponse.json({ cancelled: true });
}
