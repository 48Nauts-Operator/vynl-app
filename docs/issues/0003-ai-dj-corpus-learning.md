## Summary

Use real, identified DJ sets (from #85) as ground-truth training data for set construction patterns. The AI DJ feature learns how real DJs build sets — BPM curves, key flow, energy arcs, genre walks — and uses that to generate better sets.

## Why

Most AI DJ tools (commercial too) generate from metadata + an LLM prompt alone, with zero ground-truth on what real DJs *actually* do mid-set. Vynl uniquely has:
- A pipeline (#85) that produces decomposed real sets as structured data
- Local audio features per track (#72) — BPM, key, energy, danceability
- A self-hosted LLM stack to combine them

That combination doesn't exist anywhere else. It's the actual moat — see [Vynl AI DJ moat](../memory) project memory.

## Architecture

### New table `dj_reference_sets`

```
id, source_url, title, duration_ms, decomposed_at,
track_order:  JSON [{ trackId, startMs, endMs, transitionInMs, confidence }],
features:     JSON {
                bpm_curve:    number[],
                key_flow:     string[],            // Camelot codes
                energy_arc:   number[],
                genre_walk:   string[],
                tightness:    { avgOverlap, avgBpmDelta }
              },
tags:         JSON string[],                       // "house", "warmup", "peak-time", "afterhours"
notes:        text                                 // optional human notes
```

### Population pipeline

When user accepts a decomposed tracklist (#85), snapshot it into `dj_reference_sets`. A background job:
1. Reads BPM / key / energy from each identified track (#72)
2. Computes set-level features (curve, arc, tightness)
3. LLM call generates tags ("house · warmup · sundown · 110-118 BPM") from track titles + BPM curve

### AI DJ generation upgrade

Extend `src/lib/dj.ts`:
- Existing prompt-only flow stays as fallback
- When user requests a set, query `dj_reference_sets` for 3-5 similar reference sets (matching tag + similar BPM-curve shape + similar duration)
- Pass those as in-context examples to the LLM prompt
- Apply HARD constraints derived from features:
  - BPM jumps between consecutive tracks ≤ user-set tolerance (default 6%)
  - Key compatibility (Camelot adjacent: ±1 number or A↔B swap)
  - Energy arc matches the requested shape (warm-up / peak / cool-down)
- Output: ordered tracks + suggested mix-points

### UI surface

- `/party` page: "Reference sets" panel showing N learned sets
- Per generated set: "Inspired by [Carl Cox @ Awakenings 2024], [Dixon @ Sonus 2023]"
- "Improve this set" button → user feedback updates the reference scoring

## Dependencies (must land first)

- #72 — DJ rebuilt on local audio features (BPM/key/energy per track)
- #85 — DJ set decomposer (the corpus producer)
- #84 — YouTube downloader (the entry point)

## Acceptance

- [ ] `dj_reference_sets` table populated when user accepts a decomposed set
- [ ] Set-level features computed (BPM curve, key flow, energy arc) within 60s of ingest
- [ ] AI DJ generation queries the corpus when ≥1 reference set exists
- [ ] Generated sets respect Camelot key compatibility + BPM tolerance constraints
- [ ] Generation cites the reference sets it drew inspiration from
- [ ] Quality bar: a side-by-side blind A/B between corpus-driven sets and prompt-only sets, corpus-driven wins on transition tightness

## Sized

~1 day after deps land (table + ingest pipeline ~3h, AI DJ generation upgrade ~3h, UI ~2h).
