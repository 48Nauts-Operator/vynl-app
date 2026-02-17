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

interface SettingsState {
  features: FeatureFlags;
  toggleFeature: (key: keyof FeatureFlags) => void;
  setFeature: (key: keyof FeatureFlags, value: boolean) => void;
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
      toggleFeature: (key) =>
        set((state) => ({
          features: { ...state.features, [key]: !state.features[key] },
        })),
      setFeature: (key, value) =>
        set((state) => ({
          features: { ...state.features, [key]: value },
        })),
    }),
    {
      name: "vynl-settings",
    }
  )
);
