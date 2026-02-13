// [VynlDJ] — extractable: Core AI DJ set generation logic
// This module handles catalog formatting and LLM-based set curation.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// [VynlDJ] — extractable: DJ setup parameters
export interface DjSetupParams {
  audience: string[];   // e.g. ["20-30s", "40-50s"]
  vibe: string;         // "chill" | "mixed" | "dance" | "high_energy"
  durationMinutes: number;
  occasion: string;     // "house_party" | "dinner" | "bbq" | "workout" | "late_night"
  specialRequests?: string;
}

// [VynlDJ] — extractable: catalog track shape for LLM input
export interface CatalogTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  genre: string | null;
  year: number | null;
  duration: number; // seconds
  playCount: number;
  rating: number | null;
  // Audio features (from track_audio_features table)
  bpm: number | null;
  energy: number | null;
  danceability: number | null;
  key: string | null;
  camelot: string | null;
  genreRefined: string | null;
  styleTags: string[] | null;
}

// [VynlDJ] — extractable: intelligent catalog pre-filter for context window management
// BPM is king. A DJ picks tracks that can be MIXED — meaning BPM must be compatible.
// You can't mix a 90 BPM soul track into a 130 BPM house track, no matter how "energetic" both feel.
const MAX_CATALOG_TRACKS = 1500;

// BPM ranges per vibe/occasion — tracks outside get HARD EXCLUDED (not just penalized)
// These define what's physically mixable for each context.
interface VibeProfile {
  bpmMin: number;       // hard floor — nothing below this
  bpmMax: number;       // hard ceiling — nothing above this
  bpmIdeal: number;     // center of gravity for scoring
  energyMin: number;    // soft floor for energy
  energyMax: number;    // soft ceiling
}

const VIBE_PROFILES: Record<string, VibeProfile> = {
  // Workout: driving beats, 125-155 BPM. Think: treadmill, lifting, HIIT.
  // House, EDM, hard rock, pop bangers, hip-hop bangers.
  workout:     { bpmMin: 118, bpmMax: 160, bpmIdeal: 135, energyMin: 0.6, energyMax: 1.0 },

  // High energy: big room anthems, peak-hour club. 115-145 BPM.
  high_energy: { bpmMin: 110, bpmMax: 150, bpmIdeal: 128, energyMin: 0.55, energyMax: 1.0 },

  // Dance: club/party dancefloor. 110-135 BPM. Disco, house, funk, dance-pop.
  dance:       { bpmMin: 105, bpmMax: 140, bpmIdeal: 122, energyMin: 0.4, energyMax: 1.0 },

  // Mixed: full range — the DJ needs variety for peaks AND valleys.
  mixed:       { bpmMin: 70, bpmMax: 160, bpmIdeal: 110, energyMin: 0.0, energyMax: 1.0 },

  // Chill: slow grooves, downtempo. 65-110 BPM. Jazz, bossa, acoustic, trip-hop.
  chill:       { bpmMin: 60, bpmMax: 115, bpmIdeal: 90, energyMin: 0.0, energyMax: 0.55 },
};

// Occasion overrides — these tighten the vibe profile further
const OCCASION_OVERRIDES: Record<string, Partial<VibeProfile>> = {
  dinner:      { bpmMin: 65, bpmMax: 112, bpmIdeal: 88, energyMax: 0.5 },
  late_night:  { bpmMin: 90, bpmMax: 130, bpmIdeal: 115, energyMax: 0.75 },
  bbq:         { bpmMin: 80, bpmMax: 130, bpmIdeal: 105 },
};

// Genre keywords that boost/penalize per vibe
const VIBE_GENRE_BOOST: Record<string, RegExp> = {
  workout:     /house|edm|electronic|techno|trance|drum.?bass|hard.?rock|metal|punk|hip.?hop|trap|dubstep|industrial/i,
  high_energy: /rock|punk|metal|dance|electronic|pop|anthem|party|edm|hard|power|arena|house|techno/i,
  dance:       /disco|dance|funk|pop|electronic|house|edm|motown|synth|r&b|hip.?hop|party|club/i,
  mixed:       /./i,
  chill:       /jazz|bossa|lounge|ambient|acoustic|chill|soul|soft|downtempo|trip.?hop|easy listening/i,
};

const VIBE_GENRE_PENALTY: Record<string, RegExp> = {
  workout:     /bossa|lounge|ambient|easy listening|jazz|classical|acoustic|ballad|spoken|meditation/i,
  high_energy: /ambient|classical|bossa|lounge|easy listening|meditation|new age|spoken|ballad/i,
  dance:       /classical|ambient|spoken|meditation|nature|sermon|podcast|opera|ballad/i,
  mixed:       /(?!)/,
  chill:       /metal|punk|hard rock|thrash|death|grindcore|hardcore|industrial|edm|rave|techno/i,
};

export function selectCatalogForDj(
  allTracks: CatalogTrack[],
  params: DjSetupParams
): CatalogTrack[] {
  const vibe = params.vibe;
  const profile = { ...(VIBE_PROFILES[vibe] ?? VIBE_PROFILES.mixed) };

  // Apply occasion overrides
  const occasionOverride = OCCASION_OVERRIDES[params.occasion];
  if (occasionOverride) {
    Object.assign(profile, occasionOverride);
  }

  const boostRe = VIBE_GENRE_BOOST[vibe] ?? VIBE_GENRE_BOOST.mixed;
  const penaltyRe = VIBE_GENRE_PENALTY[vibe] ?? VIBE_GENRE_PENALTY.mixed;

  // Build a regex from specialRequests to boost matching genres/titles/artists
  // e.g. "soundtracks" → tracks with genre containing "soundtrack" get boosted
  let specialRe: RegExp | null = null;
  if (params.specialRequests) {
    // Extract meaningful keywords (3+ chars), ignoring filler words
    const filler = /^(the|and|but|for|not|with|some|lots|more|play|add|only|just|like|want|please|no|any)$/i;
    const keywords = params.specialRequests
      .split(/[\s,;|]+/)
      .filter((w) => w.length >= 3 && !filler.test(w))
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .map((w) => w.replace(/s$/i, "s?")); // "soundtracks" → "soundtrack s?" matches both forms
    if (keywords.length > 0) {
      specialRe = new RegExp(keywords.join("|"), "i");
    }
  }

  // When user has special requests, use "mixed" BPM profile to keep the pool wide
  // (the LLM will handle track selection based on the request)
  const hasSpecialRequests = !!params.specialRequests?.trim();
  const filterProfile = hasSpecialRequests
    ? { ...profile, bpmMin: Math.min(profile.bpmMin, 60), bpmMax: Math.max(profile.bpmMax, 160) }
    : profile;

  // PHASE 1: Hard BPM filter — exclude tracks that can't physically be mixed in this context
  const bpmFiltered = allTracks.filter((t) => {
    // If we have BPM data, apply hard filter
    if (t.bpm != null && t.bpm > 0) {
      // Allow half-time/double-time: a 140 BPM track works at 70 BPM context
      const effectiveBpm = t.bpm;
      const halfTime = t.bpm / 2;
      const doubleTime = t.bpm * 2;

      const inRange = (b: number) => b >= filterProfile.bpmMin && b <= filterProfile.bpmMax;
      if (!inRange(effectiveBpm) && !inRange(halfTime) && !inRange(doubleTime)) {
        return false; // can't be mixed — exclude
      }
    }

    // Energy hard filter for restrictive vibes
    if (t.energy != null && (vibe === "workout" || vibe === "high_energy")) {
      if (t.energy < profile.energyMin) return false;
    }
    if (t.energy != null && vibe === "chill") {
      if (t.energy > profile.energyMax + 0.1) return false; // small buffer
    }

    // Exclude very short or broken tracks
    if (t.duration < 60) return false;

    return true;
  });

  // If hard filter is too aggressive (< 100 tracks), fall back to a wider pool
  const pool = bpmFiltered.length >= 100 ? bpmFiltered : allTracks.filter((t) => t.duration >= 60);

  // PHASE 2: Score remaining tracks — BPM proximity is the strongest signal
  const scored = pool.map((t) => {
    let score = 0;
    const genre = (t.genreRefined || t.genre || "").toLowerCase();

    // BPM fit (0-40 points) — THE dominant scoring factor
    if (t.bpm != null && t.bpm > 0) {
      const bpmDist = Math.abs(t.bpm - profile.bpmIdeal);
      // Perfect BPM match = 40pts, ±30 BPM = ~10pts, ±50 BPM = 0pts
      score += Math.max(0, 40 - bpmDist * 0.8);
    } else {
      score += 10; // no BPM data: low neutral
    }

    // Energy fit (0-20 points)
    if (t.energy != null) {
      if (t.energy >= profile.energyMin && t.energy <= profile.energyMax) {
        score += 20;
      } else {
        const dist = t.energy < profile.energyMin
          ? profile.energyMin - t.energy
          : t.energy - profile.energyMax;
        score += Math.max(0, 10 - dist * 25);
      }
    } else {
      score += 8;
    }

    // Genre match (0-15 points)
    if (genre) {
      if (boostRe.test(genre)) score += 15;
      else score += 5;
      if (penaltyRe.test(genre)) score -= 15;
    }

    // Danceability (0-10 points)
    if (t.danceability != null) {
      if (vibe === "dance" || vibe === "high_energy" || vibe === "workout") {
        score += t.danceability * 10;
      } else if (vibe === "chill") {
        score += (1 - t.danceability) * 5;
      } else {
        score += 5;
      }
    }

    // Rating bonus (0-10 points) — but only if BPM fits
    if (t.rating != null) {
      score += t.rating * 2;
    }

    // Play count bonus (0-5 points)
    if (t.playCount > 0) {
      score += Math.min(5, Math.log2(t.playCount + 1));
    }

    // Special requests boost (0-25 points) — ensure user-requested genres/artists make the catalog
    if (specialRe) {
      const searchable = `${genre} ${t.title} ${t.artist} ${t.album} ${(t.styleTags || []).join(" ")}`.toLowerCase();
      if (specialRe.test(searchable)) {
        score += 25;
      }
    }

    return { track: t, score: Math.max(0, score) };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top tracks up to limit
  return scored.slice(0, MAX_CATALOG_TRACKS).map((s) => s.track);
}

// [VynlDJ] — extractable: LLM response shape
export interface DjSetResult {
  setList: Array<{ trackId: number; note: string }>;
  djNotes: string;
}

// [VynlDJ] — extractable: format catalog for LLM consumption
// Pipe-delimited for token efficiency: ~30 tokens per track (with audio features)
export function buildCatalogPrompt(tracks: CatalogTrack[]): string {
  // Check if any tracks have audio features
  const hasFeatures = tracks.some((t) => t.bpm != null);
  const header = hasFeatures
    ? "id|title|artist|album|genre|year|duration_sec|plays|rating|bpm|energy|key|camelot"
    : "id|title|artist|album|genre|year|duration_sec|plays|rating";
  // Shuffle catalog so album tracks aren't listed together — prevents lazy sequential picking
  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
  const lines = shuffled.map((t) => {
    const dur = Math.round(t.duration);
    const genre = t.genreRefined || t.genre || "Unknown";
    const year = t.year || "?";
    const rating = t.rating ?? "-";
    const base = `${t.id}|${t.title}|${t.artist}|${t.album}|${genre}|${year}|${dur}|${t.playCount}|${rating}`;
    if (!hasFeatures) return base;
    const bpm = t.bpm != null ? Math.round(t.bpm) : "-";
    const energy = t.energy != null ? t.energy.toFixed(2) : "-";
    const key = t.key || "-";
    const camelot = t.camelot || "-";
    return `${base}|${bpm}|${energy}|${key}|${camelot}`;
  });
  return [header, ...lines].join("\n");
}

// [VynlDJ] — extractable: build the DJ system prompt
// ** THIS IS THE CREATIVE HEART — refine these instructions to improve set quality **
function buildDjSystemPrompt(params: DjSetupParams, trackCount: number, catalog: CatalogTrack[]): string {
  const targetMinutes = params.durationMinutes;

  // Calculate actual average track length from catalog for accurate estimation
  const avgSec = catalog.length > 0
    ? catalog.reduce((s, t) => s + t.duration, 0) / catalog.length
    : 240;
  const avgMin = avgSec / 60;
  const estimatedTracks = Math.round(targetMinutes / avgMin);
  const targetSeconds = targetMinutes * 60;

  return `You are a world-class professional DJ with 20 years of experience, building a set list from the user's personal music library. You think in terms of energy waves, genre families, transitions, and crowd psychology.

═══════════════════════════════════════
PARTY PARAMETERS
═══════════════════════════════════════
- Audience: ${params.audience.join(", ")}
- Vibe: ${params.vibe}
- Duration: EXACTLY ${targetMinutes} minutes (${targetSeconds} seconds) — hit this within ±5 minutes
- Tracks needed: ~${estimatedTracks} (avg track = ${avgMin.toFixed(1)}min in this library)
- Occasion: ${params.occasion}
${params.specialRequests ? `- Special requests: ${params.specialRequests}` : ""}

Library size: ${trackCount} tracks (pipe-delimited, "duration_sec" = length in seconds).
${catalog.some((t) => t.bpm != null) ? `\nThe catalog includes BPM, energy (0-1), key, and Camelot codes for most tracks. USE THESE VALUES for transition planning.` : ""}

═══════════════════════════════════════
HARD CONSTRAINTS (violating these = failure)
═══════════════════════════════════════

1. ZERO DUPLICATE TRACKS. Every trackId MUST appear exactly once. This is non-negotiable.

2. DURATION MATH. Sum every selected track's duration_sec. Total MUST be between ${targetSeconds - 300}s and ${targetSeconds + 300}s. Keep a running total as you pick tracks. Verify before responding.

3. EVERY TRACK MUST FIT THE VIBE "${params.vibe}". Do not include tracks that contradict the energy level.

═══════════════════════════════════════
HOW PROFESSIONAL DJs BUILD SETS
═══════════════════════════════════════

THINK IN MINI-SETS (3-5 tracks each):
Professional DJs don't think track-by-track. They build "chapters" — groups of 3-5 tracks that share a genre/mood. Within each mini-set, tracks flow naturally because they're from the same family. The art is in the TRANSITIONS BETWEEN mini-sets.

Example flow for a 2h mixed house party:
  Mini-set 1 (warm-up): Smooth soul/R&B — 4 tracks
  Mini-set 2 (building): Funk/Motown — 4 tracks
  Mini-set 3 (rising): Disco/dance-pop — 4 tracks
  Mini-set 4 (PEAK): Party anthems/crowd favorites — 5 tracks
  Mini-set 5 (breather): Groovy mid-tempo — 3 tracks
  Mini-set 6 (second peak): Rock/pop bangers — 4 tracks
  Mini-set 7 (cool down): Mellow classics, feel-good — 4 tracks
  Mini-set 8 (closing): Anthemic singalong closer — 2 tracks

THE WAVE ENERGY MODEL:
Never stay at one energy level for more than 4-5 tracks. The set should feel like ocean waves:
  - Build tension → release at peak → breathe → build again
  - Playing bangers back-to-back for 30+ minutes EXHAUSTS the crowd
  - After every peak moment, include 1-2 lower-energy "recovery" tracks
  - Then build back up to the next peak

ENERGY CURVE for a full set:
  0-10%:   OPENER — A recognizable, mid-energy track that says "the party has started." Not too intense, not too sleepy. Sets the tone.
  10-25%:  WARM-UP — Groove-establishing tracks. Medium energy. Get people nodding.
  25-40%:  BUILDING — Energy rises. Tempo can increase slightly. More upbeat selections.
  40-55%:  FIRST PEAK — Your biggest crowd-pleasers go here. Singalongs, dance hits.
  55-65%:  BREATHER — Pull back to medium. Groovy, feel-good, but not intense. Let the crowd recover.
  65-80%:  SECOND PEAK — Build back up. This is often the highest energy point of the night.
  80-90%:  WINDING DOWN — Gradually reduce energy. Beloved classics, feel-good tracks.
  90-100%: CLOSER — End with 1-2 anthemic, universally loved tracks. Leave them wanting more.

═══════════════════════════════════════
GENRE FAMILIES & TRANSITIONS
═══════════════════════════════════════

Genres form natural families. Transition WITHIN families freely; transition BETWEEN families using bridge tracks.

FAMILY: Soul/R&B/Funk
  Soul ↔ R&B ↔ Funk ↔ Motown (all seamless)
  Bridge OUT via: Funk → Disco, or Soul → Jazz

FAMILY: Disco/Dance/Pop
  Disco ↔ Dance-Pop ↔ Synth-Pop ↔ Pop (all seamless)
  Bridge OUT via: Pop → Rock, or Disco → Funk

FAMILY: Rock/Classic Rock
  Classic Rock ↔ Blues Rock ↔ Soft Rock ↔ Arena Rock (all seamless)
  Bridge OUT via: Soft Rock → Pop, or Blues Rock → Blues → Soul

FAMILY: Electronic/Dance
  House ↔ Deep House ↔ Techno ↔ Trance (all seamless)
  Bridge OUT via: Deep House → Chill, or House → Disco

FAMILY: Jazz/Lounge/Chill
  Jazz ↔ Bossa Nova ↔ Lounge ↔ Easy Listening (all seamless)
  Bridge OUT via: Jazz → Soul, or Lounge → Soft Pop

FAMILY: Hip-Hop/Urban
  Hip-Hop ↔ R&B ↔ Trap ↔ Neo-Soul (all seamless)
  Bridge OUT via: R&B → Soul, or Hip-Hop → Funk

FAMILY: Reggae/World
  Reggae ↔ Ska ↔ Dub (all seamless)
  Bridge OUT via: Reggae → Funk, or Ska → Punk-Pop

FAMILY: Soundtrack/Film Score
  Orchestral Score ↔ Cinematic Electronic ↔ Film Theme (all seamless)
  Bridge OUT via: Film Theme → Pop (if theme has vocals), or Cinematic → Ambient/Chill
  NOTE: Soundtrack tracks vary wildly in energy/tempo. Group similar-energy soundtracks into mini-sets.
  Mix orchestral scores separately from pop/rock soundtrack songs (e.g., Top Gun, Dirty Dancing have pop tracks).

HARD TRANSITIONS TO AVOID (these kill the vibe):
  Jazz → Metal, Country → Electronic, Classical → Punk,
  Death Metal → R&B, Heavy Rock → Bossa Nova

THE BRIDGE TRACK TECHNIQUE:
When moving between genre families, use a "crossover" track that has elements of BOTH genres.
Example: To go from Soul → Disco, pick a track that's funky/soulful BUT has a danceable beat (e.g., Chic, Earth Wind & Fire, Kool & the Gang). These tracks live at the border of two genres.

═══════════════════════════════════════
VIBE-SPECIFIC STRATEGIES (BPM IS KING)
═══════════════════════════════════════

The catalog has been pre-filtered to tracks that fit this vibe's BPM range.
Your job: keep BPM TIGHT between consecutive tracks so they can be MIXED.
A DJ transition = the end of track A overlaps with the start of track B, beats aligned.

BPM PROXIMITY RULES (from real DJ practice):
  ±1-3 BPM: SAFE — almost always unnoticeable, perfect blend
  ±4-6 BPM: DOABLE — energy/feel shifts slightly, OK with intention
  >6 BPM: NEEDS A TRICK — use a breakdown, echo-out, hard cut, or energy reset
  >15 BPM: ONLY with a deliberate genre/energy shift moment (breakdown → drop, mini-set change)

VOCAL CLASH RULE:
  NEVER overlap two tracks with strong lyrics playing simultaneously.
  Mix Track B in during Track A's percussion-only/instrumental section (outro/breakdown).
  If both tracks are vocal-heavy, use a SHORTER blend (8 bars) or a clean cut.

BASSLINE RULE:
  During a blend, only ONE track should have its bassline audible. Overlapping basslines = mud.
  This means: when sequencing, prefer tracks whose intros are sparse (percussion/highs only).

"chill":
  BPM RANGE: 65-110. Keep consecutive tracks within ±4 BPM for invisible transitions.
  Energy: 0.1-0.5. Gentle undulation, never intense.
  Genres: Jazz, bossa nova, acoustic, soul, soft rock, lounge, trip-hop, downtempo.
  EXCLUDE any track above 115 BPM or energy > 0.55.
  Think: Wine bar, Sunday morning, reading. Smooth, barely-noticeable transitions.

"mixed":
  BPM RANGE: 80-140. Can journey across tempos BUT move gradually (±3-6 BPM per transition).
  Energy: Full range 0.2-0.8. Wave pattern with peaks and valleys.
  Genre diversity encouraged — this is the only vibe where you can cross BPM zones.
  Build BPM up for peaks, bring it down for breathers.
  For 80s/90s/funk vocal tracks: use SHORTER blends (8-16 bars) — these tracks aren't made for long mixes.

"dance":
  BPM SUB-LANES (stay within a lane, or transition between lanes deliberately):
    Deep House: 118-124 BPM (groovy, warm, longer blends)
    House: 124-128 BPM (steady, mix-friendly)
    Disco/Funk: 110-122 BPM (groove-based, vocal-heavy)
  Consecutive tracks MUST be within ±4 BPM (they need to be mixable with a smooth blend).
  Energy: 0.5-0.9. Even "cooldown" tracks keep a beat.
  Genres: Disco, house, funk, dance-pop, electronic, Motown, upbeat pop.
  EXCLUDE anything below 105 BPM. No ballads, no acoustic, no jazz.

"high_energy":
  BPM RANGE: 115-145. Sustained intensity, tight BPM consistency.
  Consecutive tracks MUST be within ±4 BPM.
  Energy: 0.7-1.0. No tracks below 0.6 energy.
  Genres: Rock anthems, EDM, house, dance-pop, punk, hip-hop bangers.
  For trance/vocal trance (132-140 BPM): respect the BUILD → RELEASE → BUILD narrative arc.
  EXCLUDE anything mellow, slow, or acoustic. Maximum 1 "breather" per 6 tracks.

"workout":
  BPM RANGE: 125-155. Fast, driving, powerful. This is a GYM playlist.
  Consecutive tracks MUST be within ±4 BPM.
  Energy: 0.7-1.0 throughout. No dips below 0.65.
  Genres: EDM, house, techno, drum & bass, hard rock, metal, hip-hop bangers, pop bangers.
  EXCLUDE: Anything below 120 BPM. No jazz, no soul, no acoustic, no ballads, no 80s pop under 120 BPM.
  Think: HIIT training, treadmill sprints, heavy lifting. Every beat drives you forward.

═══════════════════════════════════════
OCCASION STRATEGIES
═══════════════════════════════════════

"house_party":
  BPM: Start 95-110, build to 115-130 at peak, wind down to 100-110.
  Start background-friendly (first 20%), build to danceable peak. Singalongs are GOLD.

"dinner":
  BPM: 70-108 ONLY. Nothing faster. Keep transitions invisible.
  Jazz, bossa nova, soul, soft pop, acoustic. Energy never exceeds 0.45.

"bbq":
  BPM: 85-120. Relaxed outdoor energy.
  Classic rock, soul, reggae, funk. Familiar and feel-good.

"workout":
  BPM: 125-155. See "workout" vibe above. This is non-negotiable.
  Every track must make you want to push harder. No slow intros, no ballads.

"late_night":
  BPM: 100-128. Deep, groovy, hypnotic.
  Deep house, trip-hop, neo-soul, downtempo electronic. More adventurous picks welcome.

═══════════════════════════════════════
TRACK SELECTION INTELLIGENCE
═══════════════════════════════════════

ERA MATCHING (audience → their music):
  "20-30s" → Primarily 2005-2025. Their teenage/college years.
  "40-50s" → Primarily 1980-2005. The golden era of pop, rock, and hip-hop for this group.
  "60+" → Primarily 1960-1985. Classic rock, Motown, soul, early pop.
  "All ages" → Universal crowd-pleasers from all eras. Weight toward songs "everyone knows."

PLAY COUNT & RATINGS:
  Tracks with high play counts and ratings are PROVEN favorites — prioritize them for peak moments.
  Use lesser-known tracks (low play count) during warm-up and cool-down phases.
  Never waste a highly-rated track on the warm-up — save crowd favorites for peak energy zones.

NO BACK-TO-BACK SAME ARTIST:
  Space same-artist tracks by at least 4-5 positions. Exception: a deliberate 2-track mini-set as a highlight.

OPENER MATTERS:
  The first track sets the entire tone. It should be recognizable, set the right energy, and match the occasion.
  Bad opener = crowd loses confidence. Good opener = instant buy-in.

CLOSER MATTERS:
  End with something anthemic and universally loved. The last track is what people remember.
  "Closing time" energy — bittersweet, warm, uplifting.

${catalog.some((t) => t.bpm != null) ? `═══════════════════════════════════════
BPM TRANSITIONS (use actual BPM values from catalog)
═══════════════════════════════════════
- Perfect: ±1-3 BPM — unnoticeable, seamless blend
- Smooth: ±4-6 BPM — doable, slight energy shift
- Needs a trick: ±7-15 BPM — use breakdown, echo-out, or hard cut
- Jarring (AVOID): >15 BPM jump without a deliberate energy reset moment
- Building energy: gradually increase BPM in small steps (e.g., 95→98→102→106→110)
- Half-time trick: 140 BPM can flow into 70 BPM (beats align at half-time)

ENERGY CURVE (use actual energy values from catalog):
- "chill" vibe: keep tracks in 0.1-0.5 energy range
- "mixed" vibe: full range 0.2-0.8, wave pattern with peaks and valleys
- "dance" vibe: 0.5-0.9, minimal dips below 0.5
- "high_energy" vibe: 0.7-1.0, no tracks below 0.6

HARMONIC MIXING (use Camelot codes from catalog):
- Same Camelot key = perfect match (8A → 8A)
- Adjacent numbers = smooth (8A → 7A or 9A)
- Major/minor switch = smooth (8A → 8B)
- Avoid keys more than 2 steps apart on the Camelot wheel
- When Camelot is "-", any transition is acceptable

` : ""}═══════════════════════════════════════
COMMON DJ MISTAKES TO AVOID
═══════════════════════════════════════
- Playing the right track at the WRONG time (a banger during warm-up wastes it)
- Sustained high energy with no recovery (exhausts the crowd)
- Jarring genre jumps without a bridge track
- Ignoring the occasion (heavy metal at a dinner party)
- All deep cuts, no familiar favorites (alienates the crowd)
- All hits, no discovery (predictable and boring)
- Same tempo for 10+ tracks (monotonous — vary it)
- ALBUM DUMPING: NEVER play more than 2 tracks from the same album in a row. A DJ set is NOT an album playthrough. Spread same-album tracks across the entire set. Pull from MANY different albums and artists to create variety. If you catch yourself picking consecutive tracks from one album, STOP and pick from a different artist/album.

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════

RESPOND WITH ONLY valid JSON (no markdown fences, no text outside JSON):
{
  "setList": [
    { "trackId": <number>, "note": "<brief DJ note explaining this track's role in the set>" }
  ],
  "djNotes": "<2-3 sentence overview of the set's journey, genre flow, and energy strategy>",
  "totalDurationSec": <sum of all selected tracks' duration_sec>
}

The "note" for each track should explain its DJ purpose, e.g.:
  - "Opener — smooth groove to welcome the crowd"
  - "Building energy — funky transition from soul to disco"
  - "PEAK — crowd-favorite singalong, maximum energy"
  - "Breather — pulling back after the peak, keeping it groovy"
  - "Bridge track — connecting rock back to funk"
  - "Closer — anthemic send-off, leave them wanting more"

FINAL CHECKLIST:
- [ ] Every trackId is unique (ZERO duplicates)
- [ ] Total duration = ${targetMinutes}min ±5min (${targetSeconds - 300}s to ${targetSeconds + 300}s)
- [ ] Every track genuinely fits the "${params.vibe}" vibe
- [ ] Genre transitions are smooth (used bridge tracks where needed)
- [ ] Energy follows the wave model (peaks AND valleys)
- [ ] Set is structured in mini-sets of 3-5 related tracks
- [ ] Opener and closer are strong, recognizable tracks
- [ ] All trackIds exist in the provided catalog
- [ ] No more than 2 tracks from the same album in a row (spread albums across the set)`;
}

// [VynlDJ] — extractable: extract first complete JSON object from LLM text
// Counts balanced braces to find the correct closing }, handles strings with escaped chars
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null; // unbalanced
}

// [VynlDJ] — extractable: generate a DJ set via LLM
export async function generateDjSet(
  params: DjSetupParams,
  catalog: CatalogTrack[]
): Promise<DjSetResult> {
  const catalogPrompt = buildCatalogPrompt(catalog);
  const systemPrompt = buildDjSystemPrompt(params, catalog.length, catalog);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Here is my music library catalog:\n\n${catalogPrompt}\n\nBuild me a DJ set following your rules.`,
      },
    ],
    system: systemPrompt,
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // Extract JSON by finding balanced braces (greedy regex fails when LLM adds commentary with braces)
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) {
    console.error("DJ LLM response (no valid JSON found):", text.slice(0, 500));
    throw new Error("Failed to parse DJ set response from LLM");
  }

  const parsed = JSON.parse(jsonStr) as DjSetResult;

  // Validate all track IDs exist in catalog and remove duplicates
  const validIds = new Set(catalog.map((t) => t.id));
  const seen = new Set<number>();
  parsed.setList = parsed.setList.filter((item) => {
    if (!validIds.has(item.trackId)) return false;
    if (seen.has(item.trackId)) return false; // deduplicate
    seen.add(item.trackId);
    return true;
  });

  if (parsed.setList.length === 0) {
    throw new Error("LLM returned no valid track IDs");
  }

  return parsed;
}
