import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

interface AlbumRow {
  album: string;
  album_artist: string;
  track_count: number;
  distinct_artists: number;
  year: number | null;
  cover_path: string | null;
}

interface SimilarGroup {
  albums: { name: string; artist: string; trackCount: number; year: number | null; distinctArtists: number }[];
  reason: string;
  type: "similar" | "disc-split" | "compilation";
}

interface AnalyzeJob {
  status: "running" | "complete" | "error";
  phase: "scanning" | "matching" | "ai_analyzing" | "done";
  phaseDetail?: string;
  totalAlbums: number;
  groupsFound: number;
  suggestions: any[];
  skipped: number;
  message?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

// Persist on globalThis for HMR survival
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (_g.__vynl_albumAnalyzeJob === undefined) _g.__vynl_albumAnalyzeJob = null;

const g = {
  get job(): AnalyzeJob | null { return _g.__vynl_albumAnalyzeJob; },
  set job(v: AnalyzeJob | null) { _g.__vynl_albumAnalyzeJob = v; },
};

/** Strip disc/vol/part suffixes to get the base album name */
function stripSuffix(s: string): string {
  return s
    .replace(/\s*[\[\(]\s*(disc|cd|part|pt)\s*\d+\s*[\]\)]/gi, "")
    .replace(/\s*[\[\(]\s*(deluxe|limited|special)\s*(edition|version)?\s*[\]\)]/gi, "")
    .replace(/\s*-\s*(disc|cd)\s*\d+/gi, "")
    .replace(/,?\s*(vol\.?|volume)\s*\d+/gi, "")
    .replace(/:\s*the\s+soundtrack/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find album groups that might be duplicates, disc-splits, or compilations.
 */
function findSimilarAlbums(albums: AlbumRow[]): SimilarGroup[] {
  const groups: SimilarGroup[] = [];
  const used = new Set<number>();

  // Normalize album name for comparison
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s\-_]+/g, " ")
      .replace(/[^\w\s]/g, "")
      .trim();

  // Phase 1: Find disc-split albums (same base name after stripping suffixes)
  const baseMap = new Map<string, number[]>();
  for (let i = 0; i < albums.length; i++) {
    const base = normalize(stripSuffix(albums[i].album));
    if (!baseMap.has(base)) baseMap.set(base, []);
    baseMap.get(base)!.push(i);
  }

  for (const [, indices] of baseMap) {
    if (indices.length <= 1) continue;
    // Check that the original names are actually different (not just duplicates from GROUP BY)
    const uniqueNames = new Set(indices.map((i) => albums[i].album));
    if (uniqueNames.size <= 1) continue;

    for (const i of indices) used.add(i);
    groups.push({
      albums: indices.map((idx) => ({
        name: albums[idx].album,
        artist: albums[idx].album_artist,
        trackCount: albums[idx].track_count,
        year: albums[idx].year,
        distinctArtists: albums[idx].distinct_artists,
      })),
      reason: indices.length === 2
        ? "Disc-split or volume-split album"
        : `${indices.length} fragments of the same album`,
      type: "disc-split",
    });
  }

  // Phase 2: Find remaining similar names via Levenshtein
  for (let i = 0; i < albums.length; i++) {
    if (used.has(i)) continue;
    const matches: number[] = [i];
    const normI = normalize(albums[i].album);

    for (let j = i + 1; j < albums.length; j++) {
      if (used.has(j)) continue;
      const normJ = normalize(albums[j].album);

      // Exact normalized match
      if (normI === normJ) {
        matches.push(j);
        continue;
      }

      // One is a prefix of the other
      if (normI.length > 3 && normJ.length > 3) {
        if (normI.startsWith(normJ) || normJ.startsWith(normI)) {
          matches.push(j);
          continue;
        }
      }

      // Same artist, similar name (Levenshtein)
      if (
        albums[i].album_artist === albums[j].album_artist &&
        normI.length > 5 &&
        normJ.length > 5
      ) {
        const dist = levenshtein(normI, normJ);
        const maxLen = Math.max(normI.length, normJ.length);
        if (dist / maxLen < 0.25) {
          matches.push(j);
        }
      }
    }

    if (matches.length > 1) {
      for (const m of matches) used.add(m);
      groups.push({
        albums: matches.map((idx) => ({
          name: albums[idx].album,
          artist: albums[idx].album_artist,
          trackCount: albums[idx].track_count,
          year: albums[idx].year,
          distinctArtists: albums[idx].distinct_artists,
        })),
        reason: matches.length === 2
          ? "Similar album names"
          : `${matches.length} similar entries detected`,
        type: "similar",
      });
    }
  }

  return groups;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

async function runAnalysis() {
  const job = g.job;
  if (!job) return;

  try {
    // Phase 1: Scan albums
    job.phase = "scanning";
    job.phaseDetail = "Reading library...";

    const sqlite = (db as any).session?.client || (db as any).$client;
    const albums: AlbumRow[] = sqlite
      .prepare(
        `SELECT album,
                COALESCE(album_artist, artist) as album_artist,
                COUNT(*) as track_count,
                COUNT(DISTINCT artist) as distinct_artists,
                year, cover_path
         FROM tracks
         WHERE source = 'local' AND album != 'Unknown Album' AND album != ''
         GROUP BY album
         ORDER BY album ASC`
      )
      .all();

    job.totalAlbums = albums.length;

    if (albums.length === 0) {
      job.status = "complete";
      job.phase = "done";
      job.message = "No albums found";
      job.completedAt = Date.now();
      return;
    }

    // Phase 2: Find similar groups
    job.phase = "matching";
    job.phaseDetail = `Comparing ${albums.length} albums...`;

    // Yield to let poll see the phase change
    await new Promise((r) => setTimeout(r, 0));

    const similarGroups = findSimilarAlbums(albums);
    job.groupsFound = similarGroups.length;

    if (similarGroups.length === 0) {
      job.status = "complete";
      job.phase = "done";
      job.message = "No scattered or duplicate albums detected";
      job.completedAt = Date.now();
      return;
    }

    // Check API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      job.suggestions = similarGroups.map((g) => ({
        albums: g.albums,
        reason: g.reason,
        suggestedRule: null,
        aiAnalysis: null,
      }));
      job.status = "complete";
      job.phase = "done";
      job.message = `Found ${similarGroups.length} potential groups (AI analysis unavailable — no API key)`;
      job.completedAt = Date.now();
      return;
    }

    // Phase 3: AI analysis
    job.phase = "ai_analyzing";
    job.phaseDetail = `Sending ${similarGroups.length} groups to AI...`;

    const client = new Anthropic({ apiKey });

    const groupsSummary = similarGroups
      .map(
        (g, i) =>
          `Group ${i + 1} [${g.type}]:\n${g.albums
            .map((a) => `  - "${a.name}" by ${a.artist} (${a.trackCount} tracks, ${a.distinctArtists} distinct artists, year: ${a.year || "?"})`)
            .join("\n")}`
      )
      .join("\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `You are analyzing a music library for albums that should be merged or fixed.

Each group has a type tag:
- [disc-split]: Albums that are parts of the same release split by disc/volume suffixes
- [similar]: Albums with very similar names that might be duplicates or fragments

Here are the groups:

${groupsSummary}

For each group, determine:
1. Should these albums be merged into one? (true/false)
2. The canonical album name (strip disc/vol suffixes — the disc number is tracked separately)
3. The album artist (use "Various Artists" for compilations with many different artists)
4. A regex pattern that matches ALL variants in this group
5. Is this a compilation? (true if many different artists)
6. A brief explanation

Respond with a JSON array (no markdown fences, just raw JSON):
[
  {
    "groupIndex": 0,
    "shouldMerge": true,
    "canonicalAlbum": "The Album Name",
    "canonicalArtist": "Various Artists",
    "regexPattern": "the album name.*",
    "isCompilation": true,
    "explanation": "Multi-disc compilation, should be one album with disc numbers"
  }
]

Rules:
- Disc-split albums (e.g. "X [Disc 1]" + "X [Disc 2]") should almost always be merged
- For compilations (many distinct artists), set canonicalArtist to "Various Artists"
- Don't merge albums that just happen to have similar names from different artists
- Regex patterns should use case-insensitive matching (\\i flag applied automatically)
- Keep patterns specific enough to avoid false positives
- Strip [Disc N], Vol. N, CD N etc from canonicalAlbum — these become disc_number in the DB`,
        },
      ],
    });

    job.phaseDetail = "Processing AI response...";

    // Parse AI response
    let aiSuggestions: any[] = [];
    try {
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        aiSuggestions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // AI response wasn't valid JSON — fall back to raw groups
    }

    // Merge AI analysis with the groups
    const suggestions = similarGroups.map((group, i) => {
      const ai = aiSuggestions.find((s: any) => s.groupIndex === i);
      return {
        albums: group.albums,
        reason: group.reason,
        type: group.type,
        shouldMerge: ai?.shouldMerge ?? true,
        isCompilation: ai?.isCompilation ?? false,
        suggestedRule: ai?.shouldMerge
          ? {
              pattern: ai.regexPattern,
              targetAlbum: ai.canonicalAlbum,
              targetAlbumArtist: ai.canonicalArtist || null,
            }
          : null,
        explanation: ai?.explanation || null,
      };
    });

    const actionable = suggestions.filter((s) => s.shouldMerge && s.suggestedRule);

    job.suggestions = actionable;
    job.skipped = suggestions.filter((s) => !s.shouldMerge).length;
    job.message = `AI analyzed ${similarGroups.length} groups, ${actionable.length} need cleanup`;
    job.status = "complete";
    job.phase = "done";
    job.completedAt = Date.now();
  } catch (err) {
    console.error("Album analysis error:", err);
    if (g.job) {
      g.job.status = "error";
      g.job.phase = "done";
      g.job.error = String(err);
      g.job.completedAt = Date.now();
    }
  }
}

/** POST — start an analysis job */
export async function POST() {
  if (g.job?.status === "running") {
    return NextResponse.json(
      { error: "An analysis job is already running" },
      { status: 409 }
    );
  }

  g.job = {
    status: "running",
    phase: "scanning",
    totalAlbums: 0,
    groupsFound: 0,
    suggestions: [],
    skipped: 0,
    startedAt: Date.now(),
  };

  // Fire and forget
  runAnalysis();

  return NextResponse.json({ message: "Analysis started", status: "running" });
}

/** GET — poll job status */
export async function GET() {
  if (!g.job) {
    return NextResponse.json({ status: "idle" });
  }

  return NextResponse.json({
    status: g.job.status,
    phase: g.job.phase,
    phaseDetail: g.job.phaseDetail,
    totalAlbums: g.job.totalAlbums,
    groupsFound: g.job.groupsFound,
    suggestions: g.job.status === "complete" ? g.job.suggestions : [],
    skipped: g.job.skipped,
    message: g.job.message,
    error: g.job.error,
    startedAt: g.job.startedAt,
    completedAt: g.job.completedAt,
  });
}
