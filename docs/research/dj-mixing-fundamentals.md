# DJ Mixing Fundamentals — Research Notes

> Reference material for Vynl AI DJ development. Sourced from professional DJ practice.

## Learning Layers (how DJs develop)

1. **Timing** — beats + phrases (the foundation)
2. **Musical compatibility** — key, harmony, energy
3. **Taste + crowd reading** — the art layer

## Two Key Truths

1. There **are** objective constraints (BPM, phrase structure, key, groove/genre, energy)
2. There is **no universal "track A → track B" list** — arrangement, vocals, basslines, and vibe matter, and DJs deliberately break "rules" for effect

---

## 1. Beatmatching + Phrasing

### Beatmatching
- Match tempo (BPM)
- Align downbeats (the "1" of a bar)
- Keep aligned with micro nudges

### Phrasing (the hidden skill)
Most dance music is built in **phrases** (commonly 8/16/32 bars). Intros/outros are designed for mixing.

DJs start Track B at the beginning of a phrase so that Track B's drop/chorus lands exactly when Track A is ending or breaking down.

**Implication for AI DJ:** We should detect phrase boundaries (or estimate them from song structure analysis) and time transitions at those boundaries.

---

## 2. Musical Compatibility

### A) BPM Ranges and Safe Tempo Moves

| Range | Safety |
|-------|--------|
| ±1-3 BPM | Almost always safe, unnoticeable |
| ±4-6 BPM | Doable but energy/feel changes |
| >6 BPM | Need tricks: breakdowns, echo outs, hard cuts |

Half-time/double-time illusions: 70 ↔ 140 (hip-hop, DnB, dubstep)

### B) Harmonic Mixing (Camelot Wheel)

| Move | Quality |
|------|---------|
| Same key (8A → 8A) | Safest |
| Adjacent key (8A → 7A or 9A) | Very safe |
| Relative major/minor (8A ↔ 8B) | Often great |
| >2 steps apart | Avoid (clashing) |

**Critical for vocal tracks** — clashing chords/vocals sound instantly messy.

### C) Vocal Clash Management
- Never overlap two lyrical sections unless you *know* it works
- Mix Track B during Track A's outro / percussion-only section
- Or bring Track B vocals in right after Track A vocals exit

### D) Bassline Compatibility (the hidden killer)
- Even with good keys, basslines can fight rhythmically
- During blend: keep **only one bassline** at a time (EQ lows)

---

## 3. BPM Lanes by Genre

| Genre | BPM Range | Notes |
|-------|-----------|-------|
| Deep House | 118-124 | Groovy, warm, longer blends |
| House | 124-128 | Steady, mix-friendly intros/outros |
| Trance / Vocal Trance | 132-140 | Big builds, drops, "moment" mixing |
| 80s/90s Dance/Pop | 100-128 | Varies wildly; vocals dominate |
| Funk/Disco/Boogie | 95-120 | Live drummers = tempo drift |

**Rule:** Pick a "home BPM" for a section, keep transitions within ±2-4 BPM, unless using a deliberate trick.

---

## 4. Genre-Specific Transition Styles

### House / Deep House (smooth, "club mix")
1. Start Track B on a phrase boundary (16 or 32 bars before its drop)
2. Bring in Track B with mids/highs + low EQ cut
3. Swap basslines gradually (or at a clean phrase boundary)
4. Exit Track A cleanly, avoid double-vocals

### Trance / Vocal Trance (moments + tension)
- **Breakdown-to-breakdown blending** (atmospheric): align breakdown phrases, careful with keys
- **Drop swap** (big impact): time Track B's drop when Track A ends a build
- Trance audiences feel **narrative** (build → release) — transitions must respect that arc

### 80s/90s / Dance / Funk (harder than expected)
- Strong vocals, unique arrangements, sometimes live drums with micro tempo drift
- **Shorter mixes** (8-16 bars) rather than long blends
- **Echo-out / reverb-out** into next track's downbeat
- **Quick cut on the 1** (surprisingly effective when vocals dominate)
- Many DJs use "DJ edits" (intro/outro edits made for mixing)

---

## 5. The "What Fits?" Checklist (fast, DJ-realistic)

When choosing the next track, DJs mentally check:

1. **Phrase match** (non-negotiable for smooth blends)
2. **Key/harmony** (especially important for vocal tracks)
3. **Vocal clash** (don't overlap lyrical parts)
4. **Bassline compatibility** (only one bassline at a time)
5. **Energy curve** (build → release → breathe → build)

---

## 6. What Tools/Lists Exist

### What exists:
- Track metadata libraries (BPM + key + energy)
- DJ software "related tracks" suggestions
- Curated playlists/crates by DJs
- DJ edits (intro/outro edits) for older vocal music

### What does NOT exist:
A universal database saying "Song X → Song Y with transition Z" for all music. Even when BPM/key match, arrangement and vocals decide.

---

## 7. Implications for Vynl AI DJ

### What we can automate well:
- BPM matching (±3 BPM sweet spot)
- Camelot key compatibility
- Energy curve management
- Genre family transitions
- Same-artist spacing

### What needs audio analysis (future):
- Phrase boundary detection
- Vocal section identification (for clash avoidance)
- Bassline rhythm analysis
- Arrangement structure (intro/verse/chorus/outro)

### What needs taste/culture (LLM strength):
- Genre family knowledge ("Funk → Disco is smooth, Jazz → Metal is jarring")
- Era-appropriate selections for audience demographics
- "Bridge track" identification (crossover tracks between genre families)
- Opener/closer selection psychology
