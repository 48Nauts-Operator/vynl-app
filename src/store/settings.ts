"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FeatureFlags {
  podcasts: boolean;
  youtube: boolean;
  partyMode: boolean;
  discover: boolean;
  tasteProfile: boolean;
  playlists: boolean;
  developerMode: boolean;
}

export interface UIPreferences {
  /** Play the full-screen 5-star celebration when the purple vynl is
   *  clicked. Default on. When off, the click still adds the track
   *  to the All-Time Songs playlist but skips the animation. */
  celebrateFiveStar: boolean;
  /** Optional display name. Used to personalise greetings on the
   *  Home page (e.g. "Welcome back, Andre"). Empty = generic greeting. */
  userName: string;
}

interface SettingsState {
  features: FeatureFlags;
  ui: UIPreferences;
  toggleFeature: (key: keyof FeatureFlags) => void;
  setFeature: (key: keyof FeatureFlags, value: boolean) => void;
  setUIPreference: <K extends keyof UIPreferences>(
    key: K,
    value: UIPreferences[K]
  ) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      features: {
        podcasts: true,
        youtube: false,
        partyMode: true,
        discover: true,
        tasteProfile: true,
        playlists: true,
        developerMode: false,
      },
      ui: {
        celebrateFiveStar: true,
        userName: "",
      },
      toggleFeature: (key) =>
        set((state) => ({
          features: { ...state.features, [key]: !state.features[key] },
        })),
      setFeature: (key, value) =>
        set((state) => ({
          features: { ...state.features, [key]: value },
        })),
      setUIPreference: (key, value) =>
        set((state) => ({
          ui: { ...state.ui, [key]: value },
        })),
    }),
    {
      name: "vynl-settings",
    }
  )
);
