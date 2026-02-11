import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcastEpisodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { downloadFile, getEpisodeFilePath } from "@/lib/podcast-utils";
import * as fs from "fs";

// Module-level download job state
let downloadJob: {
  episodeId: number;
  status: "downloading" | "complete" | "error";
  error?: string;
} | null = null;

async function runDownload(
  episodeId: number,
  podcastId: number,
  audioUrl: string
) {
  try {
    const destPath = getEpisodeFilePath(podcastId, episodeId, audioUrl);
    await downloadFile(audioUrl, destPath);

    const stat = fs.statSync(destPath);
    db.update(podcastEpisodes)
      .set({
        localPath: destPath,
        isDownloaded: true,
        fileSize: stat.size,
      })
      .where(eq(podcastEpisodes.id, episodeId))
      .run();

    if (downloadJob) {
      downloadJob.status = "complete";
    }
  } catch (err) {
    if (downloadJob) {
      downloadJob.status = "error";
      downloadJob.error = String(err);
    }
  }
}

// POST — start downloading an episode
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  const { id, episodeId } = await params;
  const epId = parseInt(episodeId);
  const podId = parseInt(id);

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

  // Fire and forget
  runDownload(epId, podId, episode.audioUrl);

  return NextResponse.json({ status: "downloading", episodeId: epId });
}

// GET — poll download status
export async function GET() {
  if (!downloadJob) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(downloadJob);
}
