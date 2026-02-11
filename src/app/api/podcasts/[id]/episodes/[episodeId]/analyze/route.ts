import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { podcastEpisodes, episodeInsights } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

// Module-level analysis job state
let analysisJob: {
  episodeId: number;
  status: "transcribing" | "analyzing" | "complete" | "error";
  step: string;
  error?: string;
} | null = null;

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

function runFabric(input: string, pattern: string): Promise<string> {
  const fabricPath = "/Users/jarvis/go/bin/fabric";
  return new Promise((resolve, reject) => {
    const proc = spawn(fabricPath, ["-p", pattern]);
    let stdout = "";
    let stderr = "";

    proc.stdin.write(input);
    proc.stdin.end();

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `fabric exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function runAnalysis(episodeId: number, localPath: string) {
  if (!analysisJob) return;

  try {
    // Step 1: Transcribe with Whisper
    analysisJob.step = "Transcribing audio with Whisper...";
    analysisJob.status = "transcribing";

    const whisperPath = "/Users/jarvis/.pyenv/shims/whisper";
    const tempDir = path.join(os.tmpdir(), `vynl-analyze-${episodeId}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    await execFileAsync(
      whisperPath,
      [localPath, "--output_format", "txt", "--output_dir", tempDir, "--model", "base"],
      { timeout: 1800000 } // 30 min max
    );

    // Read transcript
    const baseName = path.basename(localPath, path.extname(localPath));
    const transcriptPath = path.join(tempDir, `${baseName}.txt`);
    const transcript = fs.readFileSync(transcriptPath, "utf-8");

    // Save transcript as insight
    db.insert(episodeInsights)
      .values({ episodeId, type: "transcript", content: transcript })
      .run();

    // Step 2: Run Fabric analysis
    analysisJob.status = "analyzing";

    // Summary
    analysisJob.step = "Generating summary with Fabric...";
    try {
      const summary = await runFabric(transcript, "summarize");
      db.insert(episodeInsights)
        .values({ episodeId, type: "summary", content: summary })
        .run();
    } catch {
      // Non-fatal
    }

    // Extract wisdom
    analysisJob.step = "Extracting wisdom with Fabric...";
    try {
      const wisdom = await runFabric(transcript, "extract_wisdom");
      db.insert(episodeInsights)
        .values({ episodeId, type: "wisdom", content: wisdom })
        .run();
    } catch {
      // Non-fatal
    }

    // Clean up temp files
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // Best-effort cleanup
    }

    analysisJob.status = "complete";
    analysisJob.step = "Analysis complete";
  } catch (err) {
    if (analysisJob) {
      analysisJob.status = "error";
      analysisJob.error = String(err);
      analysisJob.step = "Failed";
    }
  }
}

// POST — start analysis
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; episodeId: string }> }
) {
  const { episodeId } = await params;
  const epId = parseInt(episodeId);

  if (analysisJob && (analysisJob.status === "transcribing" || analysisJob.status === "analyzing")) {
    return NextResponse.json(
      { error: "An analysis is already running", episodeId: analysisJob.episodeId },
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

  if (!episode.localPath || !episode.isDownloaded) {
    return NextResponse.json(
      { error: "Episode must be downloaded first" },
      { status: 400 }
    );
  }

  // Check for required tools
  const hasWhisper = await checkCommand("/Users/jarvis/.pyenv/shims/whisper");
  const hasFabric = await checkCommand("/Users/jarvis/go/bin/fabric");

  if (!hasWhisper) {
    return NextResponse.json(
      { error: "Whisper is not installed. Install it with: pip install openai-whisper" },
      { status: 500 }
    );
  }

  analysisJob = {
    episodeId: epId,
    status: "transcribing",
    step: "Starting...",
  };

  if (!hasFabric) {
    // Can still transcribe, just skip Fabric
    analysisJob.step = "Fabric not available — will transcribe only";
  }

  // Fire and forget
  runAnalysis(epId, episode.localPath);

  return NextResponse.json({ status: "started", episodeId: epId });
}

// GET — poll analysis status
export async function GET() {
  if (!analysisJob) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(analysisJob);
}
