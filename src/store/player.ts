"use client";

import { create } from "zustand";

export type OutputTarget = "browser" | "sonos";

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  filePath?: string;
  coverPath?: string;
  source: "local" | "spotify" | "youtube" | "radio";
  sourceId?: string;
  streamUrl?: string;
}

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  outputTarget: OutputTarget;
  sonosSpeaker: string | null;
  shuffled: boolean;
  repeatMode: "off" | "all" | "one";

  setTrack: (track: Track) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  playNext: () => void;
  playPrev: () => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setOutputTarget: (target: OutputTarget) => void;
  setSonosSpeaker: (speaker: string | null) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  outputTarget: "sonos",
  sonosSpeaker: "Office",
  shuffled: false,
  repeatMode: "off",

  setTrack: (track) =>
    set({ currentTrack: track, isPlaying: true, currentTime: 0 }),

  setQueue: (tracks, startIndex = 0) =>
    set({
      queue: tracks,
      queueIndex: startIndex,
      currentTrack: tracks[startIndex] || null,
      isPlaying: true,
      currentTime: 0,
    }),

  addToQueue: (track) =>
    set((state) => ({ queue: [...state.queue, track] })),

  playNext: () => {
    const { queue, queueIndex, repeatMode, shuffled } = get();
    if (queue.length === 0) return;

    let nextIndex: number;
    if (repeatMode === "one") {
      nextIndex = queueIndex;
    } else if (shuffled) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeatMode === "all") {
          nextIndex = 0;
        } else {
          set({ isPlaying: false });
          return;
        }
      }
    }
    set({
      queueIndex: nextIndex,
      currentTrack: queue[nextIndex],
      isPlaying: true,
      currentTime: 0,
    });
  },

  playPrev: () => {
    const { queue, queueIndex, currentTime } = get();
    if (queue.length === 0) return;

    if (currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }

    const prevIndex = queueIndex > 0 ? queueIndex - 1 : queue.length - 1;
    set({
      queueIndex: prevIndex,
      currentTrack: queue[prevIndex],
      isPlaying: true,
      currentTime: 0,
    });
  },

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setOutputTarget: (target) => set({ outputTarget: target }),
  setSonosSpeaker: (speaker) => set({ sonosSpeaker: speaker }),
  toggleShuffle: () => set((state) => ({ shuffled: !state.shuffled })),
  cycleRepeat: () =>
    set((state) => ({
      repeatMode:
        state.repeatMode === "off"
          ? "all"
          : state.repeatMode === "all"
            ? "one"
            : "off",
    })),
}));
