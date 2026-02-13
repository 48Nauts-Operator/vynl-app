// [VynlDJ] — extractable: Dual-deck crossfade engine for DJ transition preview
//
// Two HTML5 Audio elements alternate between tracks, replicating how a real
// DJ mixes on two turntables/CDJs. When the active track nears its end, the
// next track starts on the other deck with a smooth ease-in-out volume ramp.
//
// Flow per transition:
//   1. Active deck plays the track's ending (last `previewDuration` seconds)
//   2. Near end: inactive deck loads next track from 0:00
//   3. Volume ramps: outgoing fades out, incoming fades in (rAF-driven)
//   4. After crossfade: incoming deck becomes active, plays beginning for
//      `previewDuration` seconds, then seeks to ending → repeat
//
// Only active when previewMode=true AND outputTarget="browser" (headphones).
// Regular useAudioPlayer handles all non-preview playback.
"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player";

// Smooth ease-in-out for natural-sounding volume ramps
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function buildUrl(track: { filePath?: string; streamUrl?: string }): string | null {
  if (track.filePath) return `/api/audio${track.filePath}`;
  if (track.streamUrl) return track.streamUrl;
  return null;
}

export function useDJCrossfade() {
  const deckA = useRef<HTMLAudioElement | null>(null);
  const deckB = useRef<HTMLAudioElement | null>(null);
  const activeDeck = useRef<"A" | "B">("A");
  // "ending" = playing tail of track (pre-crossfade), "starting" = playing head (post-crossfade)
  const phase = useRef<"starting" | "ending">("ending");
  const xfading = useRef(false);
  const rafId = useRef<number>(0);
  const tickId = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track ID on the deck that was pre-loaded during crossfade, to avoid reloading
  const preloadedId = useRef<number | null>(null);

  const {
    currentTrack,
    isPlaying,
    volume,
    previewMode,
    previewDuration,
    outputTarget,
    setCurrentTime,
    setDuration,
    playNext,
    setCrossfadeProgress,
  } = usePlayerStore();

  const act = () => (activeDeck.current === "A" ? deckA : deckB).current;
  const inact = () => (activeDeck.current === "A" ? deckB : deckA).current;

  // ── Initialise both decks ─────────────────────────────────────────
  useEffect(() => {
    deckA.current = new Audio();
    deckA.current.preload = "auto";
    deckB.current = new Audio();
    deckB.current.preload = "auto";
    return () => {
      deckA.current?.pause();
      deckB.current?.pause();
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  // ── Teardown when preview OFF ─────────────────────────────────────
  useEffect(() => {
    if (previewMode) return;
    for (const d of [deckA, deckB]) {
      d.current?.pause();
      if (d.current) d.current.removeAttribute("src");
    }
    cancelAnimationFrame(rafId.current);
    if (tickId.current) clearInterval(tickId.current);
    xfading.current = false;
    activeDeck.current = "A";
    phase.current = "ending";
    preloadedId.current = null;
    setCrossfadeProgress(0);
  }, [previewMode, setCrossfadeProgress]);

  // ── Load current track on active deck ─────────────────────────────
  useEffect(() => {
    if (!previewMode || outputTarget !== "browser" || !currentTrack) return;

    // Skip if this track was already pre-loaded by a crossfade
    if (preloadedId.current === currentTrack.id) {
      preloadedId.current = null;
      return;
    }
    preloadedId.current = null;

    const deck = act();
    if (!deck) return;

    const url = buildUrl(currentTrack);
    if (!url) return;

    phase.current = "ending";
    xfading.current = false;

    deck.src = url;
    deck.volume = volume;

    const onReady = () => {
      setDuration(deck.duration);
      deck.currentTime = Math.max(0, deck.duration - previewDuration);
      const { isPlaying: playing } = usePlayerStore.getState();
      if (playing) deck.play().catch(() => {});
    };

    deck.addEventListener("loadedmetadata", onReady, { once: true });
    deck.load();

    return () => deck.removeEventListener("loadedmetadata", onReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, previewMode, outputTarget]);

  // ── Play / Pause ──────────────────────────────────────────────────
  useEffect(() => {
    if (!previewMode || outputTarget !== "browser") return;
    const a = act();
    if (!a) return;

    if (isPlaying) {
      a.play().catch(() => {});
      if (xfading.current) inact()?.play().catch(() => {});
    } else {
      a.pause();
      inact()?.pause();
      cancelAnimationFrame(rafId.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, previewMode, outputTarget]);

  // ── Volume (outside crossfade — ramp handles it during) ───────────
  useEffect(() => {
    if (!previewMode || xfading.current) return;
    const a = act();
    if (a) a.volume = volume;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, previewMode]);

  // ── Main crossfade engine ─────────────────────────────────────────
  useEffect(() => {
    if (!previewMode || outputTarget !== "browser") return;

    const xfadeSecs = Math.min(previewDuration, 8);

    const tick = () => {
      const a = act();
      if (!a || !a.duration || xfading.current) return;

      const s = usePlayerStore.getState();
      if (!s.isPlaying) return;

      s.setCurrentTime(a.currentTime);

      // ─ Phase "starting": beginning of track (post-crossfade) ─
      if (phase.current === "starting") {
        if (a.currentTime >= s.previewDuration) {
          // Done hearing the beginning → seek to ending for next transition
          phase.current = "ending";
          a.currentTime = Math.max(0, a.duration - s.previewDuration);
        }
        return;
      }

      // ─ Phase "ending": tail of track — watch for crossfade trigger ─
      const remaining = a.duration - a.currentTime;
      if (remaining > xfadeSecs || remaining < 0.1) return;

      const { queue, queueIndex } = s;
      const ni = queueIndex + 1;
      if (ni >= queue.length) return; // last track — let it finish

      const nextTrack = queue[ni];
      const nextUrl = buildUrl(nextTrack);
      if (!nextUrl) return;

      // ── Begin crossfade ──
      xfading.current = true;
      const b = inact();
      if (!b) return;

      b.src = nextUrl;
      b.volume = 0;
      b.currentTime = 0;
      b.load();

      const beginRamp = () => {
        b.play().catch(() => {});
        const t0 = performance.now();
        const rampMs = remaining * 1000;

        const ramp = (now: number) => {
          const st = usePlayerStore.getState();
          if (!st.isPlaying) return; // paused during crossfade

          const p = Math.min(1, (now - t0) / rampMs);
          const curve = easeInOut(p);

          a.volume = st.volume * (1 - curve);
          b.volume = st.volume * curve;
          st.setCrossfadeProgress(p);

          // Show incoming track's time in second half of crossfade
          if (p > 0.5) st.setCurrentTime(b.currentTime);

          if (p < 1) {
            rafId.current = requestAnimationFrame(ramp);
          } else {
            // ── Crossfade complete ──
            a.pause();
            a.removeAttribute("src");

            activeDeck.current = activeDeck.current === "A" ? "B" : "A";
            phase.current = "starting";
            xfading.current = false;
            preloadedId.current = nextTrack.id;

            st.setCrossfadeProgress(0);
            if (b.duration) st.setDuration(b.duration);
            st.playNext();
          }
        };

        rafId.current = requestAnimationFrame(ramp);
      };

      b.addEventListener("canplay", beginRamp, { once: true });
    };

    // 100ms polling for precise crossfade timing (timeupdate only fires ~4Hz)
    tickId.current = setInterval(tick, 100);

    // Handle natural end without crossfade (last track in queue)
    const a = act();
    const onEnded = () => {
      if (!xfading.current) {
        usePlayerStore.getState().playNext();
      }
    };
    a?.addEventListener("ended", onEnded);

    return () => {
      if (tickId.current) clearInterval(tickId.current);
      cancelAnimationFrame(rafId.current);
      a?.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, outputTarget, previewDuration, currentTrack]);
}
