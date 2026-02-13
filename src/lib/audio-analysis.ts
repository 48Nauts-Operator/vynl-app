// [VynlDJ] — extractable: LLM-based track audio feature analysis
// Estimates BPM, energy, danceability, key, and refined genre from song metadata
// using Claude's knowledge of popular music. Designed for batch enrichment of entire libraries.

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { tracks, trackAudioFeatures } from "@/lib/db/schema";
import { notInArray } from "drizzle-orm";

const anthropic = new Anthropic();

// [VynlDJ] — extractable: Camelot wheel mapping for harmonic mixing
const KEY_TO_CAMELOT: Record<string, string> = {
  "Ab major": "4B", "G# major": "4B",
  "Eb major": "5B", "D# major": "5B",
  "Bb major": "6B", "A# major": "6B",
  "F major": "7B",
  "C major": "8B",
  "G major": "9B",
  "D major": "10B",
  "A major": "11B",
  "E major": "12B",
  "B major": "1B", "Cb major": "1B",
  "F# major": "2B", "Gb major": "2B",
  "Db major": "3B", "C# major": "3B",
  "F minor": "4A",
  "C minor": "5A",
  "G minor": "6A",
  "D minor": "7A",
  "A minor": "8A",
  "E minor": "9A",
  "B minor": "10A",
  "F# minor": "11A", "Gb minor": "11A",
  "Db minor": "12A", "C# minor": "12A",
  "Ab minor": "1A", "G# minor": "1A",
  "Eb minor": "2A", "D# minor": "2A",
  "Bb minor": "3A", "A# minor": "3A",
};

export interface TrackInput {
  id: number;
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  year: number | null;
}

export interface AnalysisResult {
  id: number;
  bpm: number | null;
  energy: number | null;
  danceability: number | null;
  key: string | null;
  camelot: string | null;
  genreRefined: string | null;
  styleTags: string[];
  confidence: number;
}

interface AnalysisJob {
  status: "running" | "complete" | "cancelled" | "error";
  phase: string;
  processed: number;
  total: number;
  enriched: number;
  errors: number;
  error?: string;
  startedAt: number;
}

// globalThis pattern to persist across HMR
const _g = globalThis as typeof globalThis & {
  __vynl_trackAnalysis?: AnalysisJob | null;
  __vynl_trackAnalysisCancel?: boolean;
};

export function getAnalysisJob(): AnalysisJob | null {
  return _g.__vynl_trackAnalysis ?? null;
}

export function cancelAnalysisJob(): void {
  _g.__vynl_trackAnalysisCancel = true;
}

// [VynlDJ] — extractable: batch analysis via LLM
async function analyzeTrackBatch(batch: TrackInput[]): Promise<AnalysisResult[]> {
  const lines = batch.map((t) => {
    const genre = t.genre || "Unknown";
    const year = t.year || "?";
    return `${t.id}|${t.title}|${t.artist}|${t.album}|${genre}|${year}`;
  });

  const input = `id|title|artist|album|genre|year\n${lines.join("\n")}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Analyze these ${batch.length} tracks. For each, provide your best estimate based on your knowledge of the artist, song, genre, and era.\n\n${input}\n\nRespond with ONLY a JSON array, no markdown fences.`,
      },
    ],
    system: `You are a music analysis expert. For each track provided, estimate audio features based on your knowledge of the song, artist, and genre.

Return a JSON array where each element has:
- "id": the track ID from input (integer)
- "bpm": beats per minute (integer). Use genre conventions if you don't know the exact track.
  Rock/Pop: 100-140, Disco: 115-125, Hip-Hop: 85-105, Soul/R&B: 90-115, Jazz: 80-160, Electronic: 120-140
- "energy": 0.0-1.0 (0=ambient/calm, 0.5=moderate/groovy, 1.0=intense/anthemic)
- "danceability": 0.0-1.0 (0=not danceable, 1.0=peak dancefloor)
- "key": musical key (e.g., "C major", "A minor"). Estimate from knowledge or "unknown".
- "genre_refined": more specific genre (e.g., "Philly Soul" not just "Soul", "Synth-Pop" not just "Pop")
- "style_tags": 2-4 descriptive tags like ["groovy","upbeat","singalong","crowd-pleaser"]
- "confidence": 0.0-1.0 (0.9+ for well-known hits, 0.3-0.5 for obscure tracks)

Rules:
- Return ONLY the JSON array, no explanation or markdown fences
- Every track in the input MUST appear in the output
- Use null for fields you truly cannot estimate`,
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // Parse JSON (may be wrapped in fences despite instruction)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse analysis response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    id: number;
    bpm: number | null;
    energy: number | null;
    danceability: number | null;
    key: string | null;
    genre_refined: string | null;
    style_tags: string[];
    confidence: number;
  }>;

  return parsed.map((r) => {
    const keyStr = r.key && r.key !== "unknown" ? r.key : null;
    const camelot = keyStr ? KEY_TO_CAMELOT[keyStr] ?? null : null;
    return {
      id: r.id,
      bpm: r.bpm,
      energy: r.energy != null ? Math.max(0, Math.min(1, r.energy)) : null,
      danceability: r.danceability != null ? Math.max(0, Math.min(1, r.danceability)) : null,
      key: keyStr,
      camelot,
      genreRefined: r.genre_refined ?? null,
      styleTags: r.style_tags ?? [],
      confidence: r.confidence ?? 0.5,
    };
  });
}

// [VynlDJ] — extractable: full library analysis orchestrator
export async function runFullAnalysis(): Promise<void> {
  // Prevent concurrent runs
  if (_g.__vynl_trackAnalysis?.status === "running") {
    return;
  }

  _g.__vynl_trackAnalysisCancel = false;

  // Find tracks that don't yet have audio features
  const existingIds = db
    .select({ trackId: trackAudioFeatures.trackId })
    .from(trackAudioFeatures)
    .all()
    .map((r) => r.trackId);

  const unanalyzed = existingIds.length > 0
    ? db.select().from(tracks).where(notInArray(tracks.id, existingIds)).all()
    : db.select().from(tracks).all();

  const total = unanalyzed.length;
  if (total === 0) {
    _g.__vynl_trackAnalysis = {
      status: "complete",
      phase: "done",
      processed: 0,
      total: 0,
      enriched: 0,
      errors: 0,
      startedAt: Date.now(),
    };
    return;
  }

  const job: AnalysisJob = {
    status: "running",
    phase: "analyzing",
    processed: 0,
    total,
    enriched: 0,
    errors: 0,
    startedAt: Date.now(),
  };
  _g.__vynl_trackAnalysis = job;

  const BATCH_SIZE = 20;

  for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
    if (_g.__vynl_trackAnalysisCancel) {
      job.status = "cancelled";
      return;
    }

    const batch: TrackInput[] = unanalyzed.slice(i, i + BATCH_SIZE).map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      year: t.year,
    }));

    try {
      const results = await analyzeTrackBatch(batch);

      // Insert results into DB
      const validIds = new Set(batch.map((b) => b.id));
      for (const r of results) {
        if (!validIds.has(r.id)) continue;
        try {
          db.insert(trackAudioFeatures)
            .values({
              trackId: r.id,
              bpm: r.bpm,
              energy: r.energy,
              danceability: r.danceability,
              key: r.key,
              camelot: r.camelot,
              genreRefined: r.genreRefined,
              styleTags: JSON.stringify(r.styleTags),
              analysisMethod: "llm",
              confidence: r.confidence,
            })
            .run();
          job.enriched++;
        } catch {
          // Duplicate or constraint error — skip
          job.errors++;
        }
      }

      job.processed += batch.length;
    } catch (err) {
      console.error("Batch analysis error:", err);
      job.errors += batch.length;
      job.processed += batch.length;
    }
  }

  job.status = "complete";
  job.phase = "done";
}
