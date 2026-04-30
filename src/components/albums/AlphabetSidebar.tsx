"use client";

import React, { useMemo } from "react";

interface Album {
  album: string;
  album_artist: string;
}

interface AlphabetSidebarProps {
  albums: Album[];
  sortField: "album" | "album_artist";
  onLetterSelect: (letter: string) => void;
  activeLetter?: string;
}

const LETTERS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function AlphabetSidebar({ albums, sortField, onLetterSelect, activeLetter }: AlphabetSidebarProps) {
  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    for (const album of albums) {
      const value = album[sortField] || "";
      const first = value.charAt(0).toUpperCase();
      if (/[A-Z]/.test(first)) {
        set.add(first);
      } else if (first) {
        set.add("#");
      }
    }
    return set;
  }, [albums, sortField]);

  return (
    <div
      className="flex flex-col items-center justify-center gap-0.5 py-2 px-2 select-none"
      style={{ position: "sticky", top: "6rem", height: "fit-content" }}
    >
      {LETTERS.map((letter) => {
        const available = availableLetters.has(letter);
        const isActive = activeLetter === letter;

        return (
          <button
            key={letter}
            onClick={() => {
              if (available) {
                // Toggle: click same letter again to clear filter
                onLetterSelect(isActive ? "" : letter);
              }
            }}
            disabled={!available}
            className={`
              w-7 h-7 flex items-center justify-center rounded-md
              text-sm font-semibold
              transition-all duration-150 origin-center
              ${isActive
                ? "text-primary-foreground bg-primary scale-125"
                : available
                  ? "text-muted-foreground hover:text-foreground hover:scale-150 hover:font-bold"
                  : "text-muted-foreground/20 cursor-default"
              }
            `}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}
