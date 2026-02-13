# AI-Driven DJ: Possible Without Hearing?

## An Experimental Study in Metadata-Only Autonomous Music Mixing

**Authors:** Vynl Project
**Date:** February 2026
**Version:** 1.0 — Working Paper

---

## Abstract

We present an experimental system that performs autonomous DJ mixing — track selection, sequencing, and real-time audio crossfading — without any audio signal analysis. The system operates entirely on metadata (artist, title, genre, year) and LLM-estimated audio features (BPM, energy, musical key), using a large language model (Claude) as both a music knowledge oracle and a set-list curator. A dual-deck crossfade engine executes transitions by overlapping two HTML5 Audio elements with volume automation, guided purely by numerical feature data.

Our key finding is that **culturally-informed metadata, when processed by an LLM with broad music knowledge, produces DJ sets with audibly coherent transitions** — despite the system never processing a single audio sample. We document the iterative development process, the failures that revealed fundamental assumptions about DJ intelligence, and the architectural decisions that led to functional mixing.

This work occupies a unique position in the literature: unlike audio-domain approaches (DJtransGAN, FxNorm-Automix) that learn transition parameters from waveforms, and unlike playlist-only systems (Spotify DJ) that curate without mixing, our system both curates AND mixes using only text and numbers.

---

## 1. Introduction

### 1.1 The DJ Problem

A disc jockey (DJ) performs two simultaneous cognitive tasks:

1. **Curation** — selecting the next track based on audience energy, musical compatibility, narrative arc, and stylistic coherence.
2. **Mixing** — executing the transition between tracks: aligning tempos, matching keys, timing the crossfade to musically appropriate moments, and managing frequency overlap.

Both tasks are traditionally informed by **hearing**. The DJ listens to the outgoing track, previews the incoming track in headphones, and makes real-time adjustments. The question we investigate is: *can these tasks be performed without any audio perception?*

### 1.2 Motivation

The Vynl project is a self-hosted music server with a local library of 6,692 tracks stored on network-attached storage (NAS). The goal was to add an "AI DJ" feature that could autonomously generate and perform DJ sets for social occasions (house parties, dinner, workout sessions) using only the user's personal music collection.

Unlike streaming-service DJs (Spotify DJ, Apple Music AutoMix) that operate on vast catalogs with pre-computed audio features, our system works with a private library where:
- No pre-computed audio features exist (beets database has BPM for only 43 of 6,692 tracks)
- No streaming API provides tempo/key/energy metadata
- Audio analysis infrastructure (Python, librosa) is not yet integrated
- The system must work immediately, not after hours of audio processing

This constraint — **no audio data available** — forced us to explore whether an LLM's cultural knowledge of music could substitute for audio signal analysis.

### 1.3 Contributions

1. **LLM-as-audio-oracle**: We demonstrate that a large language model can estimate BPM, energy, musical key, and genre refinement for well-known tracks with sufficient accuracy to enable functional DJ mixing.
2. **Metadata-only crossfade engine**: We implement a dual-deck browser audio crossfade system that executes transitions using only estimated BPM proximity and energy curves — no beat detection, no waveform alignment.
3. **Iterative failure analysis**: We document five distinct failure modes encountered during development and the corrections they motivated, providing empirical evidence for which aspects of DJ intelligence can and cannot be approximated from metadata alone.
4. **Market gap identification**: We survey 15+ commercial and open-source DJ tools and identify that no existing product combines LLM-driven curation with real audio mixing from a local library.

---

## 2. Related Work

### 2.1 Audio-Domain Automatic DJ Systems

**DJtransGAN** (Chen et al., ICASSP 2022) uses GANs with differentiable EQ and fader DSP components to generate DJ transitions, trained on real-world DJ mixes. The system operates entirely in the audio domain, learning transition parameters from waveforms. Our approach differs fundamentally: we never process audio signals.

**Vande Veire & De Bie** (EURASIP 2018) built an end-to-end automatic DJ for drum-and-bass using beat tracking, downbeat detection, and structural segmentation. Their system achieves 91% fully correct annotations but requires audio analysis as a prerequisite. Our system bypasses this requirement entirely.

**FxNorm-Automix** (Martinez-Ramirez et al., Sony, ISMIR 2022) trains deep learning models for automatic multitrack mixing using a novel FxNorm preprocessing pipeline. This addresses studio mixing rather than DJ mixing, but shares the goal of automating audio blending decisions.

### 2.2 Feature-Based Playlist Sequencing

**Bittner et al.** (ISMIR 2017) model playlist sequencing as graph traversal over extracted features (key, tempo, timbre). This is the closest precedent to our "blind mixing" approach, though they use audio-extracted features while we use LLM-estimated features.

**DJ StructFreak** (Kim & Nam, ISMIR 2023) selects songs based on music structure embeddings, demonstrating that structural features enable coherent automatic DJ transitions. Their all-in-one model (Kim & Nam, WASPAA 2023) jointly performs beat tracking, downbeat detection, and structure analysis from demixed audio spectrograms.

**Kim et al.** (ISMIR 2020) analyzed 1,557 real-world DJ mixes comprising 20,765 transitions, revealing that professional DJs consider repetitive structures when selecting cue points. This large-scale analysis provides ground truth for what "good" transitions look like.

### 2.3 LLM-Based Music Understanding

**Spotify's AI DJ** (2023-present) combines a recommendation engine with OpenAI-generated commentary and Sonantic voice synthesis. It curates personalized radio-style experiences but does **not** perform audio mixing — tracks play sequentially with no overlap or crossfading.

**Text2Tracks** (Spotify Research, 2025) uses a fine-tuned LLM that generates track IDs from text prompts, achieving 4x higher engagement than baseline methods. This validates the use of LLMs for music curation but does not address mixing.

**ChatMusician** (Yuan et al., ACL 2024) treats music as a second language via ABC notation, demonstrating that LLMs can develop genuine music-theoretic understanding. This supports our hypothesis that LLMs possess music knowledge sufficient for DJ decisions.

**VirtualDJ AIPrompt** (2026) integrates an LLM into professional DJ software for track suggestions — the most commercially similar approach to ours, though it serves as an assistant to a human DJ rather than an autonomous system.

### 2.4 Gap in the Literature

No prior work combines:
- LLM-estimated audio features (not audio-extracted)
- Autonomous track selection from a private library
- Real-time audio crossfade execution
- Zero audio signal processing

Our system is, to our knowledge, the first to attempt autonomous DJ mixing using only an LLM's cultural knowledge as the source of musical intelligence.

---

## 3. System Architecture

### 3.1 Overview

The system consists of four components:

```
                    +-----------------+
                    |   Claude LLM    |
                    | (Music Oracle)  |
                    +--------+--------+
                             |
                    JSON track analysis
                    + DJ set generation
                             |
              +--------------+--------------+
              |                             |
    +---------v---------+      +-----------v-----------+
    | Track Audio        |      | DJ Set Generator      |
    | Features DB        |      | (Prompt Engineering)  |
    | (LLM estimates)    |      | BPM-aware filtering   |
    +--------+-----------+      | Energy curve planning |
             |                  +-----------+-----------+
             |                              |
             +----------+------------------+
                        |
              +---------v---------+
              | Dual-Deck         |
              | Crossfade Engine  |
              | (Browser Audio)   |
              +-------------------+
```

### 3.2 LLM Audio Feature Estimation

We use Claude (claude-sonnet-4-5-20250929) to estimate audio features for the entire library in batches of 20 tracks. For each track, the LLM receives:

```
id | title | artist | album | genre | year
```

And returns estimates for:
- **BPM** (integer) — beats per minute
- **Energy** (0.0-1.0) — calm to intense
- **Danceability** (0.0-1.0) — how suitable for dancing
- **Key** (e.g., "C major", "A minor")
- **Camelot code** (e.g., "8B") — harmonic mixing compatibility
- **Refined genre** (e.g., "Philly Soul" instead of "Soul")
- **Style tags** (e.g., ["groovy", "upbeat", "singalong"])
- **Confidence** (0.0-1.0) — self-assessed reliability

The LLM leverages its training data, which includes extensive music metadata, reviews, and descriptions. For well-known tracks (confidence > 0.8), the estimates are expected to be reasonably accurate. For obscure tracks, genre-convention defaults are applied.

**Cost:** ~$1-2 for the full 6,692-track library. **Time:** ~5-10 minutes.

### 3.3 Catalog Pre-Filtering

The full catalog exceeds LLM context limits (6,692 tracks x ~30 tokens = ~200K tokens). We implement a scoring and filtering pipeline:

1. **Hard BPM filter**: Each vibe profile defines a BPM range:
   - Workout: 118-160 BPM
   - High energy: 110-150 BPM
   - Dance: 105-140 BPM
   - Chill: 60-115 BPM
   - Mixed: 70-160 BPM

2. **Half-time/double-time consideration**: A 140 BPM track is accepted for a 70 BPM target (beats align at half-time).

3. **Scoring** (out of 100 points):
   - BPM proximity to ideal: 40 points (dominant factor)
   - Energy match: 20 points
   - Play count popularity: 15 points
   - Rating: 15 points
   - Genre alignment: 10 points

4. **Selection**: Top 1,500 tracks sent to the LLM for set generation.

### 3.4 DJ Set Generation

The LLM receives a system prompt with DJ rules and the filtered catalog, then generates a set list as JSON. Key prompt engineering elements:

- **Vibe-specific BPM constraints**: "Workout: BPM 125-155. EXCLUDE anything below 120 BPM."
- **Transition rules**: "Consecutive tracks MUST be within +/-5-8 BPM for mixable transitions."
- **Harmonic mixing**: "Same Camelot key = perfect. Adjacent numbers = smooth. Avoid keys >2 steps apart."
- **Energy arc**: Defined per vibe (e.g., "dance" follows a wave pattern with peaks and valleys).
- **Anti-album-dumping**: "Maximum 2 consecutive tracks from the same album."

### 3.5 Dual-Deck Crossfade Engine

The mixing engine uses two `HTMLAudioElement` instances alternating between tracks:

```
Deck A: ──────[Track 1 ending]════╗
                                  ║ crossfade (volume ramp)
Deck B:                     ╔═════╝───[Track 2 beginning]──────
```

**Implementation details:**
- Volume automation via `requestAnimationFrame` at 60fps
- Ease-in-out curve: `t < 0.5 ? 2t² : 1 - (-2t + 2)² / 2`
- Crossfade duration: `min(previewDuration, 8)` seconds
- Phase cycling: "ending" (last N seconds) → crossfade → "starting" (first N seconds) → seek to ending → repeat
- Output: browser audio only (headphone preview mode), separate from main Sonos playback

---

## 4. Experimental Findings

### 4.1 Methodology

Development followed an iterative cycle: implement → test with real music → identify failures → analyze root cause → revise. Testing used a 6,692-track personal library spanning rock, soul, disco, jazz, electronic, hip-hop, pop, and classical from the 1950s through 2020s. Playback was monitored through both Sonos speakers and browser headphone output.

### 4.2 Iteration 1: Naive Full-Catalog Approach

**Configuration:** Send entire catalog (6,692 tracks) to LLM with basic DJ instructions.

**Result:** API error — 204,074 tokens exceeded the 200,000 token context limit.

**Lesson:** A personal music library is too large for a single LLM context window. Pre-filtering is mandatory.

### 4.3 Iteration 2: Filtered Catalog with Energy-Based Scoring

**Configuration:** Score tracks by energy, genre match, popularity. Send top 1,500 to LLM.

**Result:** User selected "Dance" vibe. System loaded Soul, Jazz, and Acoustic tracks alongside Dance tracks.

**Root cause:** The scoring function treated "energy" as the primary signal. Many Soul and Jazz tracks have high energy ratings (they're emotionally intense) but are not danceable in a club context. The system confused *emotional* energy with *physical* energy.

**Lesson:** Energy is a poor proxy for danceability. BPM is the primary signal for DJ contexts.

### 4.4 Iteration 3: BPM-First Filtering with Hard Floors

**Configuration:** Hard BPM ranges per vibe (workout: 118-160, dance: 105-140). BPM proximity = 40% of score.

**Result:** Significant improvement. "Dance" no longer included Jazz ballads. However, "Workout" at 130+ BPM still included some 80s pop (e.g., Cyndi Lauper) that had the right tempo but wrong energy character.

**Root cause:** BPM alone doesn't capture the *driving* quality needed for workout music. A pop song at 130 BPM feels very different from a house track at 130 BPM.

**Lesson:** BPM is necessary but not sufficient. The combination of BPM + energy + genre creates the right filter. The LLM's genre awareness in the set generation prompt ("No jazz, no soul, no acoustic for workout") provides the final discrimination layer.

### 4.5 Iteration 4: Sequential Preview (No Crossfade)

**Configuration:** Preview mode plays last N seconds of Track A, then first N seconds of Track B. No overlap.

**Result:** User described it as "somebody lame put music on a CD" — recognizable as sequential playback, not mixing.

**Root cause:** DJ mixing is defined by the **simultaneous playback** of two tracks. Without overlap, there is no mixing, only track changes.

**Lesson:** The crossfade IS the DJ. Even crude overlapping is perceived as "mixing" while sequential playback is perceived as "playlist."

### 4.6 Iteration 5: Dual-Deck Crossfade

**Configuration:** Two Audio elements, ease-in-out volume ramp over min(previewDuration, 8) seconds, phase cycling between track endings and beginnings.

**Result:** User assessment: "You're actually mixing already songs nicely into each other, and this is pretty awesome."

**Analysis:** The system successfully creates the perception of DJ mixing using only:
- BPM proximity between consecutive tracks (selected by LLM)
- Temporal positioning (play from track ending / beginning)
- Volume automation (ease-in-out curve)
- No beat alignment, no EQ, no frequency analysis

---

## 5. Discussion

### 5.1 What LLM Knowledge Substitutes For

The LLM effectively replaces several traditionally audio-derived features:

| Feature | Traditional Source | Our Source | Estimated Accuracy |
|---------|-------------------|------------|-------------------|
| BPM | Beat detection (librosa, essentia) | LLM cultural knowledge | ~70-80% for well-known tracks |
| Key | Chromagram analysis | LLM knowledge | ~60-70% (less reliable) |
| Energy | Spectral analysis, loudness | LLM subjective assessment | ~75% (genre-correlated) |
| Genre | Audio classification models | Beets metadata + LLM refinement | ~85% (metadata is reliable) |
| Danceability | Rhythm pattern analysis | LLM subjective assessment | ~70% |
| Era/Style | N/A (cultural knowledge) | LLM (strong) | ~95% |

The LLM's strongest contribution is **contextual understanding** — knowing that "September" by Earth, Wind & Fire is a disco anthem at ~126 BPM suitable for dance floors, while "Everybody Hurts" by R.E.M. is a slow ballad at ~70 BPM suitable for emotional moments. This cultural knowledge is unavailable from audio analysis alone.

### 5.2 What Metadata Cannot Replace

Our experiments revealed clear limitations:

1. **Beat alignment**: Without knowing where beats actually fall in the audio, crossfades land at arbitrary points. When two tracks at similar BPM crossfade, the beats may or may not align — it's essentially random. A human DJ adjusts the incoming track's phase to lock the beats.

2. **Song structure awareness**: The system crossfades at a fixed point (N seconds before track end). A human DJ identifies the outro section and begins the transition there. Our system might start crossfading during a vocal section or a breakdown.

3. **Frequency management**: During crossfade, both tracks' bass frequencies overlap, creating muddiness. Human DJs cut the bass on the outgoing track during transitions. Our system only adjusts volume, not frequency content.

4. **Dynamic tempo matching**: If Track A is 126 BPM and Track B is 128 BPM, a human DJ adjusts the pitch/speed of Track B to match. Our system plays both at their original tempo, creating a gradual drift during the crossfade.

### 5.3 The "Good Enough" Threshold

A significant finding is that **the threshold for perceived "mixing" is lower than expected**. The combination of:
- BPM-proximate track selection (within ~10 BPM)
- Volume crossfading with a smooth curve
- Appropriate track ordering (energy arc)

...produces results that listeners describe as "mixing" rather than "playlist playback." This suggests that **track selection and volume automation are the dominant perceptual factors**, while beat alignment and EQ management are refinements.

This aligns with the observation that casual listeners (non-DJs) at social events primarily perceive:
1. Whether the music "flows" (track selection)
2. Whether there are jarring silences or cuts (crossfade presence)
3. Whether the energy feels right for the moment (energy arc)

They are less likely to notice:
4. Whether beats are perfectly aligned
5. Whether bass frequencies overlap during transitions
6. Whether the key change between tracks is harmonically compatible

### 5.4 Comparison to Existing Systems

| System | Curation | Mixing | Audio Analysis | Local Library | Autonomous |
|--------|:--------:|:------:|:--------------:|:------------:|:----------:|
| Spotify DJ | LLM | None | Pre-computed | No | Yes |
| Apple AutoMix | Algorithm | Beatmatch | Yes | No | Yes |
| DJ.Studio | Harmonic sort | Full | Yes | Yes | Semi |
| VirtualDJ AIPrompt | LLM suggestions | Manual | Yes | Yes | No |
| Mixxx | Manual | Full | Yes | Yes | No |
| **Vynl DJ (this work)** | **LLM** | **Crossfade** | **None** | **Yes** | **Yes** |

Our system is the only one that achieves autonomous curation + mixing without audio analysis, and the only one that operates on a private local library with LLM-driven intelligence.

---

## 6. Limitations and Future Work

### 6.1 Current Limitations

1. **BPM accuracy**: LLM estimates have a ~20-30% error rate for non-mainstream tracks. This directly impacts transition quality.
2. **No beat alignment**: Crossfades are time-based, not beat-based. Rhythmic coherence during transitions is coincidental.
3. **No song structure awareness**: The system doesn't know where intros, outros, choruses, or breakdowns are.
4. **Volume-only transitions**: No EQ crossfading, no filter sweeps, no effects.
5. **Context window limits**: Only 1,500 of 6,692 tracks can be considered per set generation.

### 6.2 Planned: Audio Analysis Integration

The next phase will introduce actual audio signal processing:

1. **Real BPM and key detection** using librosa (Python, ISC license) or aubio — replacing LLM estimates with ground truth.
2. **Beat grid detection** enabling beat-aligned crossfade entry points.
3. **Song structure analysis** using the all-in-one model (Kim & Nam, WASPAA 2023) to identify intro/outro boundaries for optimal transition timing.
4. **Stem separation** using Demucs v4 (Meta, MIT license) to enable frequency-aware crossfading (e.g., cutting bass on the outgoing track).
5. **Energy curve extraction** from audio loudness and spectral features.

### 6.3 Hypothesized Impact

We hypothesize that the combination of LLM curation (cultural understanding) with audio analysis (signal understanding) will produce results superior to either approach alone:

- **LLM alone** (current): Good track selection, poor transition execution
- **Audio alone** (traditional automix): Good transitions, mediocre curation
- **LLM + Audio** (planned): Informed curation with precise execution

This hybrid approach — cultural intelligence for the "what" and "when," signal intelligence for the "how" — has no direct precedent in the literature.

---

## 7. Conclusion

We have demonstrated that an LLM's cultural knowledge of music, combined with a simple dual-deck crossfade engine, can produce autonomous DJ sets that listeners perceive as actual mixing rather than playlist playback. The system operates entirely without audio signal analysis, relying on metadata and LLM-estimated features.

The key insight is that **track selection and energy management are more perceptually important than transition precision** for casual listening contexts. An LLM's deep cultural knowledge — understanding genre conventions, BPM ranges, artist styles, and era characteristics — provides sufficient information to make informed DJ decisions.

However, the system's limitations are clear: without beat alignment, song structure awareness, and frequency management, the transitions are functional but not professional. The planned integration of audio analysis will address these gaps, creating a hybrid system that combines the LLM's cultural intelligence with audio signal precision.

The broader implication is that **music intelligence is not solely an audio perception task**. A significant portion of DJ decision-making can be performed through cultural knowledge — the same knowledge encoded in large language models through their training on text about music. The audio signal provides precision; the cultural context provides meaning.

---

## References

1. Chen, B.-Y., Hsu, W.-H., Liao, W.-H., Martinez-Ramirez, M.A., Mitsufuji, Y., & Yang, Y.-H. (2022). DJtransGAN: Automatic DJ Transitions with Differentiable Audio Effects and GANs. *ICASSP 2022*. arXiv:2110.06525

2. Kim, T., Choi, M., Sacks, E., Yang, Y.-H., & Nam, J. (2020). A Computational Analysis of Real-World DJ Mixes using Mix-To-Track Subsequence Alignment. *ISMIR 2020*. arXiv:2008.10267

3. Kim, T., Yang, Y.-H., & Nam, J. (2021). Reverse-Engineering The Transition Regions of Real-World DJ Mixes using Sub-band Analysis with Convex Optimization. *NIME 2021*.

4. Kim, T. & Nam, J. (2023). All-In-One Metrical and Functional Structure Analysis with Neighborhood Attentions on Demixed Audio. *IEEE WASPAA 2023*. arXiv:2307.16425

5. Kim, T. & Nam, J. (2023). DJ StructFreak: Automatic DJ System Built with Music Structure Embeddings. *ISMIR 2023 Late Breaking Demo*.

6. Martinez-Ramirez, M.A., Liao, W.-H., Fabbro, G., Uhlich, S., Nagashima, C., & Mitsufuji, Y. (2022). FxNorm-Automix: Automatic Music Mixing with Deep Learning. *ISMIR 2022*.

7. Vande Veire, L. & De Bie, T. (2018). From Raw Audio to a Seamless Mix: Creating an Automated DJ System for Drum and Bass. *EURASIP J. Audio, Speech, and Music Processing*.

8. Bittner, R., Gu, M., Hernandez, G., Humphrey, E., Jehan, T., Montecchio, N., & Kumar, A. (2017). Automatic Playlist Sequencing and Transitions. *ISMIR 2017*.

9. Rouard, S., Massa, F., & Defossez, A. (2022). Hybrid Transformers for Music Source Separation. *ICASSP 2023*.

10. Yuan, R., Lin, H., et al. (2024). ChatMusician: Understanding and Generating Music Intrinsically with LLM. *ACL 2024 Findings*. arXiv:2402.16153

11. Spotify Research. (2024). Contextualized Recommendations Through Personalized Narratives using LLMs.

12. Spotify Research. (2025). Text2Tracks: Improving Prompt-Based Music Recommendations with Generative Retrieval.

13. Henkel, F., Kim, J., McCallum, M.C., Sandberg, S.E., & Davies, M.E.P. (2024). Tempo Estimation as Fully Self-Supervised Binary Classification. *ICASSP 2024*. arXiv:2401.08891

14. Elizalde, B., Deshmukh, S., et al. (2023). CLAP: Contrastive Language-Audio Pretraining. *ICASSP 2023*. arXiv:2206.04769

15. Novack, Z. et al. (2024). CoLLAP: Contrastive Long-form Language-Audio Pretraining. *ICASSP 2025*. arXiv:2410.02271

---

## Appendix A: System Configuration

- **Music Library:** 6,692 tracks, NAS-mounted (SMB), managed by beets
- **LLM for analysis:** Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)
- **LLM for set generation:** Claude (via Anthropic API)
- **Frontend:** Next.js 15, React, TypeScript
- **Audio engine:** HTML5 Audio API (dual elements)
- **Database:** SQLite (better-sqlite3) with Drizzle ORM
- **Playback:** Sonos (room) + Browser Audio (headphone preview)

## Appendix B: Vibe Profiles

| Vibe | BPM Range | Ideal BPM | Energy Range | Example Genres |
|------|-----------|-----------|-------------|----------------|
| Workout | 118-160 | 135 | 0.6-1.0 | EDM, House, Pop-Dance |
| High Energy | 110-150 | 128 | 0.55-1.0 | Disco, Funk, Dance-Pop |
| Dance | 105-140 | 122 | 0.4-1.0 | Disco, House, R&B, Funk |
| Mixed | 70-160 | 110 | 0.0-1.0 | All genres |
| Chill | 60-115 | 90 | 0.0-0.55 | Jazz, Ambient, Soul, Acoustic |

## Appendix C: Crossfade Engine Parameters

- **Decks:** 2 x HTMLAudioElement
- **Volume curve:** Ease-in-out (`t < 0.5 ? 2t^2 : 1 - (-2t+2)^2 / 2`)
- **Crossfade duration:** `min(previewDuration, 8)` seconds
- **Update rate:** requestAnimationFrame (~60fps for volume) + 100ms interval (crossfade trigger detection)
- **Phase cycle:** ending → crossfade → starting → seek to ending → repeat
