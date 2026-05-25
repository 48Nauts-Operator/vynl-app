## Summary

Vynl plays snippets from your library, you guess what they are. "Name That Track" / "Pop Master" played against your own music. Skills practice + family entertainment.

## Why

Vynl is already accumulating rich per-track data (genre, year, BPM via #72, audio features). All that data unlocks a fun gamified surface that costs nothing extra to build and works on day one — no external API, no rate limits, plays via existing audio infrastructure.

It's also a great Family Profiles use case (when that lands) — per-profile high scores, family leaderboard, themed challenges.

## Modes (rank-ordered by build complexity)

| # | Mode | What plays | Notes |
|---|------|------------|-------|
| 1 | Name the artist | 5s snippet | 4 multiple-choice options |
| 2 | Name the track title | 10s snippet | Multiple choice or free-text |
| 3 | Name the year / decade | 5s snippet | Fun for nostalgia |
| 4 | Name the genre | 5s snippet | Easy |
| 5 | Beatmatch the BPM | listen, then guess ±3 BPM | Uses #72 audio features |
| 6 | Name the original (a remix) | 5s snippet from a remix | Uses #85 decomposer corpus |
| 7 | Name the DJ | 30s snippet from a known set | Uses #86 reference-sets corpus |

Modes 1-4 ship in v1 (no dependencies). Modes 5-7 ride on the DJ pipeline tasks.

## Gameplay

- Mode selector + difficulty slider ("popular only" ↔ "deep cuts")
- 5-30s snippet (length varies by mode)
- 4-option multiple choice OR free-text with fuzzy match (#78)
- 30s to answer; faster = more points
- Streak bonus, daily challenge, per-mode personal best
- Per-profile leaderboard (once Family Profiles ships)

## Frontend

- New `/trainer` page
- Snippet plays via existing audio infrastructure (browser or Sonos)
- Answer input + immediate feedback (right / wrong, what it actually was)
- Session score + per-mode personal best
- "Play again" / "next mode" / "share score"

## Backend

- Reuse existing `/api/audio` for snippet streaming with `?start=<sec>&duration=<sec>` params
- New `/api/trainer/round` → random-track-with-filters response (track + 4 plausible decoys)
- Game state in DB: `trainer_sessions`, `trainer_answers` for stats
- Optional LLM hint generator: "It's a 2010s pop track from a female artist"

## Dependencies

- Core game (modes 1-4): just needs the existing library + audio playback
- Mode 5 (Beatmatch BPM): #72 local audio features
- Mode 6 (Name the original): #85 decomposer
- Mode 7 (Name the DJ): #86 corpus

## Acceptance

- [ ] `/trainer` page with mode selector
- [ ] Modes 1-4 playable end-to-end (snippet plays, answer judged, score updated)
- [ ] Difficulty slider actually filters track pool
- [ ] Free-text mode uses fuzzy match (close enough wins)
- [ ] Per-mode personal best persists across sessions

## Sized

~half day for v1 (modes 1-4), +half day for v2 (modes 5-7) once their dependencies land.
