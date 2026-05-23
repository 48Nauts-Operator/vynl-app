import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcastEpisodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { startEpisodeDownload } from "@/lib/podcast-utils";

// Module-level singleton state for foreground (user-initiated) downloads.
// Background auto-downloads from the subscribe route call startEpisodeDownload
// directly and do NOT touch this state — it's purely a UI-polling concern.
let downloadJob: {
  episodeId: number;
  status: "downloading" | "complete" | "error";
  error?: string;
} | null = null;

// POST — start downloading an episode (foreground, with UI polling)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  const { episodeId } = await params;
  const epId = parseInt(episodeId);

  if (downloadJob && downloadJob.status === "downloading") {
    return NextResponse.json(
      { error: "A download is already in progress", episodeId: downloadJob.episodeId },
      { status: 409 }
    );
  }

  const episode = db
    .select()
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.id, epId))
    .get();

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  if (episode.isDownloaded) {
    return NextResponse.json({ status: "already_downloaded" });
  }

  downloadJob = { episodeId: epId, status: "downloading" };

  // Fire and forget — update UI state when it finishes.
  startEpisodeDownload(epId)
    .then(() => {
      if (downloadJob && downloadJob.episodeId === epId) {
        downloadJob.status = "complete";
      }
    })
    .catch((err) => {
      if (downloadJob && downloadJob.episodeId === epId) {
        downloadJob.status = "error";
        downloadJob.error = String(err);
      }
    });

  return NextResponse.json({ status: "downloading", episodeId: epId });
}

// GET — poll download status
export async function GET() {
  if (!downloadJob) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(downloadJob);
}
