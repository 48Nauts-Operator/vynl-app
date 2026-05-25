// Track identification helpers.
//
// Two modes:
//   - name: fast MusicBrainz REST search by current title + artist.
//   - audio: Chromaprint fpcalc fingerprint -> AcoustID lookup ->
//     MusicBrainz recording. Slower, but works on tracks with
//     broken/missing metadata.
//
// MusicBrainz requires a User-Agent that identifies the app and
// version (their fair-use policy). Rate limit is 1 req/sec for
// unauthenticated clients — caller is expected to debounce.

import { spawn } from "child_process";

export interface IdentifyMatch {
  /** 0..1 — confidence from AcoustID (audio mode) or normalised
   *  MusicBrainz score (name mode). */
  score: number;
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  /** MusicBrainz recording id. */
  recordingId: string | null;
  /** MusicBrainz release id (the specific album release matched). */
  releaseId: string | null;
  source: "musicbrainz-name" | "acoustid-audio";
}

import { getSettingOrEnv } from "@/lib/app-settings";

const UA = "Vynl/0.6.x (https://github.com/48Nauts-Operator/vynl-app)";
const MB_BASE = "https://musicbrainz.org/ws/2";
const ACOUSTID_BASE = "https://api.acoustid.org/v2";

/** Read at request time so a freshly-saved Settings key takes effect
 *  without a server restart. */
function defaultAcoustIdKey(): string {
  return getSettingOrEnv("acoustid_api_key", "ACOUSTID_API_KEY") || "";
}

/**
 * Search MusicBrainz by title + artist. Returns the top 5 candidate
 * recordings. Fast (single HTTP roundtrip).
 */
export async function identifyByName(
  title: string,
  artist: string
): Promise<IdentifyMatch[]> {
  const query = encodeURIComponent(
    `recording:"${title}" AND artist:"${artist}"`
  );
  const url = `${MB_BASE}/recording?query=${query}&fmt=json&limit=5`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz returned ${res.status}`);
  }
  const data = await res.json();
  type MBRecording = {
    id: string;
    title: string;
    score?: number;
    "artist-credit"?: Array<{ name: string }>;
    releases?: Array<{ id: string; title: string; date?: string }>;
  };
  const recordings = (data.recordings || []) as MBRecording[];
  return recordings.map((r) => {
    const credit = (r["artist-credit"] || []).map((a) => a.name).join(", ");
    const release = (r.releases || [])[0];
    const year = release?.date
      ? parseInt(release.date.slice(0, 4), 10) || null
      : null;
    return {
      score: (r.score || 0) / 100,
      title: r.title,
      artist: credit || artist,
      album: release?.title || null,
      year,
      recordingId: r.id,
      releaseId: release?.id || null,
      source: "musicbrainz-name" as const,
    };
  });
}

/** Run fpcalc on a file, returning { duration, fingerprint }. */
async function runFpcalc(
  filePath: string,
  timeoutMs = 15_000
): Promise<{ duration: number; fingerprint: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("fpcalc", ["-json", filePath]);
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", (err) => {
      clearTimeout(killer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(killer);
      if (code !== 0) {
        reject(new Error(`fpcalc exited ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve({ duration: parsed.duration, fingerprint: parsed.fingerprint });
      } catch (err) {
        reject(new Error(`fpcalc JSON parse failed: ${String(err)}`));
      }
    });
  });
}

/**
 * Audio-fingerprint identification: fpcalc -> AcoustID -> top
 * recording matches with MusicBrainz IDs. Requires the `fpcalc`
 * binary (libchromaprint-tools) and an AcoustID API key.
 */
export async function identifyByAudio(
  filePath: string,
  apiKey?: string
): Promise<IdentifyMatch[]> {
  const key = apiKey || defaultAcoustIdKey();
  if (!key) {
    throw new Error(
      "AcoustID API key not configured. Settings → AcoustID API Key, or set ACOUSTID_API_KEY env var."
    );
  }

  let fp;
  try {
    fp = await runFpcalc(filePath);
  } catch (err) {
    throw new Error(
      `fpcalc unavailable or failed (need libchromaprint-tools in the image): ${String(err).slice(0, 120)}`
    );
  }

  const params = new URLSearchParams({
    client: key,
    duration: String(Math.round(fp.duration)),
    fingerprint: fp.fingerprint,
    meta: "recordings+releases",
  });
  const res = await fetch(`${ACOUSTID_BASE}/lookup?${params.toString()}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`AcoustID lookup returned ${res.status}`);
  }
  const data = await res.json();
  if (data.status !== "ok") {
    throw new Error(`AcoustID error: ${data.error?.message || "unknown"}`);
  }

  type AcoustResult = {
    id: string;
    score: number;
    recordings?: Array<{
      id: string;
      title?: string;
      artists?: Array<{ name?: string }>;
      releases?: Array<{ id: string; title: string; date?: { year?: number } }>;
    }>;
  };
  const results = (data.results || []) as AcoustResult[];
  const flat: IdentifyMatch[] = [];
  for (const r of results) {
    for (const rec of r.recordings || []) {
      const credit = (rec.artists || []).map((a) => a.name).filter(Boolean).join(", ");
      const release = (rec.releases || [])[0];
      flat.push({
        score: r.score,
        title: rec.title || "(unknown)",
        artist: credit || "Unknown Artist",
        album: release?.title || null,
        year: release?.date?.year ?? null,
        recordingId: rec.id,
        releaseId: release?.id || null,
        source: "acoustid-audio",
      });
    }
  }
  // Best matches first.
  return flat.sort((a, b) => b.score - a.score).slice(0, 5);
}
