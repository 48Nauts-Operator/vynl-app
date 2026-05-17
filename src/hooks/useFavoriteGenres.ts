"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "vynl.favoriteGenres";

function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeToStorage(values: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

/**
 * Persistent per-browser favorite genre list. Synced across tabs via the
 * `storage` event so toggling a star on one tab updates other open tabs.
 */
export function useFavoriteGenres(): {
  favorites: string[];
  isFavorite: (genre: string) => boolean;
  toggleFavorite: (genre: string) => void;
} {
  const [favorites, setFavorites] = useState<string[]>([]);

  // Hydrate from storage after mount to avoid SSR mismatch.
  useEffect(() => {
    setFavorites(readFromStorage());

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavorites(readFromStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleFavorite = useCallback((genre: string) => {
    setFavorites((prev) => {
      const next = prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre].sort((a, b) => a.localeCompare(b));
      writeToStorage(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (genre: string) => favorites.includes(genre),
    [favorites]
  );

  return { favorites, isFavorite, toggleFavorite };
}
