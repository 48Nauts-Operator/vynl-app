// BeetsAI Doctor — LLM prompt builders.
//
// Each function takes a finding's context and returns the prompt the LLM
// will see. Every prompt asks for STRICT JSON output of the shape:
//
//   { shouldFix: boolean, confidence: 0..1,
//     command: "modify" | "skip",
//     args: string[],                // arguments to `beet` (excluding "beet" itself)
//     reasoning: string }
//
// Confidence must be EXACTLY 1.0 only when the LLM is certain — any
// uncertainty drops it below 1.0 so the runner queues it for human review.

import type { CompilationCandidate, DiscSplitCandidate } from "./detect";

const STRICT_JSON_RULES = `
Return ONLY a JSON object (no markdown fences, no preamble). Shape:
{
  "shouldFix": boolean,
  "confidence": number between 0.0 and 1.0,
  "command": "modify" | "skip",
  "args": array of strings (beet command-line args, excluding "beet" itself),
  "reasoning": "short one-sentence explanation"
}
Confidence 1.0 ONLY if you are CERTAIN this fix is correct. Any doubt → confidence < 1.0
so the change is deferred to human review. Prefer caution.
`.trim();

export function buildCompilationPrompt(c: CompilationCandidate): string {
  return `You are auditing an album that may be an unflagged compilation.

Album: "${c.album}"
Current albumartist: "${c.currentAlbumArtist || "(unset)"}"
Currently flagged as comp: ${c.isFlaggedComp}
Track count: ${c.trackCount}
Distinct track artists: ${c.distinctArtists}
Year: ${c.year ?? "unknown"}
Sample distinct artists: ${c.sampleArtists.slice(0, 8).map((s) => `"${s}"`).join(", ")}
Sample track titles: ${c.sampleTitles.slice(0, 8).map((s) => `"${s}"`).join(", ")}

Decide whether this should be flagged as a compilation
(albumartist="Various Artists", comp=1) so all tracks group as one album.

Guidance:
- Clear "Various Artists" compilation albums (DJ mixes like "Ibiza Uncovered",
  "NOW That's What I Call Music", soundtracks with many performers, label
  samplers) → shouldFix=true, confidence=1.0
- Single-artist album where tracks just have "feat. X" → shouldFix=false, confidence=1.0
- Anything ambiguous (could be either) → shouldFix=true, confidence between 0.5 and 0.95
- The proposed fix is always:
  args = ["modify", "-y", "album:${c.album}", "albumartist=Various Artists", "comp=1"]

${STRICT_JSON_RULES}`;
}

export function buildDiscSplitPrompt(c: DiscSplitCandidate): string {
  const partsList = c.parts
    .map(
      (p, i) =>
        `  ${i + 1}. "${p.album}" by ${p.albumArtist || "(unknown)"} — ${p.trackCount} tracks${p.year ? ` (${p.year})` : ""}`
    )
    .join("\n");

  return `You are auditing what looks like a multi-disc album split into
separate beets entries that should be merged into one.

Base name: "${c.baseName}"
Variants found:
${partsList}

Decide whether all these entries should be merged into a single album by
renaming each variant to the base name. After the merge, beets will
treat them as one album (with disc numbers preserved on individual tracks).

Guidance:
- "X" + "X [Disc 1]" + "X [Disc 2]" by the same artist → shouldFix=true, confidence=1.0
- "X" + "X Vol. 2" by the same artist might be sequels (different albums) — be careful, confidence ≤ 0.7
- "X (Deluxe)" + "X" might be reissue vs original — usually merge, confidence ~0.85
- Different artists with same album name → shouldFix=false, confidence=1.0 (not a split)

If shouldFix=true, propose ONE modify command that renames each variant's
album field to "${c.baseName}". For multi-step renames, the args array
should target the FIRST variant; the runner will iterate the rest.
Proposed args template:
  args = ["modify", "-y", "album:<variant-name>", "album=${c.baseName}"]

${STRICT_JSON_RULES}`;
}
