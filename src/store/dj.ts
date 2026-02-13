// [VynlDJ] — extractable: DJ session state management
"use client";

import { create } from "zustand";
import type { DjSetupParams } from "@/lib/dj";
import type { Track } from "@/store/player";

// [VynlDJ] — extractable: DJ session shape from API
export interface DjSessionData {
  id: number;
  audience: string | null;
  vibe: string;
  durationMinutes: number | null;
  occasion: string | null;
  specialRequests: string | null;
  djNotes: string | null;
  trackCount: number;
  status: string;
  createdAt: string | null;
}

// [VynlDJ] — extractable: track with DJ-specific metadata
export interface DjTrack extends Track {
  position: number;
  djNote: string | null;
  bpm: number | null;
  energy: number | null;
  key: string | null;
  camelot: string | null;
}

interface DjState {
  session: DjSessionData | null;
  setList: DjTrack[];
  isGenerating: boolean;
  error: string | null;

  generateSet: (params: DjSetupParams) => Promise<void>;
  loadSession: (sessionId: number) => Promise<void>;
  clearSession: () => void;
}

export const useDjStore = create<DjState>((set) => ({
  session: null,
  setList: [],
  isGenerating: false,
  error: null,

  generateSet: async (params) => {
    set({ isGenerating: true, error: null, session: null, setList: [] });

    try {
      // 3-minute timeout — LLM generation with large catalogs can take 60-90s
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);

      const res = await fetch("/api/dj/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      set({
        session: data.session,
        setList: data.tracks,
        isGenerating: false,
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "DJ generation timed out — try a shorter set or simpler request"
          : err instanceof Error
            ? err.message
            : "Unknown error";
      set({
        isGenerating: false,
        error: message,
      });
    }
  },

  loadSession: async (sessionId) => {
    set({ isGenerating: true, error: null });

    try {
      const res = await fetch(`/api/dj/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({
        session: data.session,
        setList: data.tracks,
        isGenerating: false,
      });
    } catch (err) {
      set({
        isGenerating: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },

  clearSession: () => set({ session: null, setList: [], error: null }),
}));
