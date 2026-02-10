"use client";

import { useEffect } from "react";
import { usePlayerStore } from "@/store/player";

export function useKeyboardShortcuts() {
  const { togglePlay, playNext, playPrev, setVolume, volume } =
    usePlayerStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            playNext();
          }
          break;
        case "ArrowLeft":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            playPrev();
          }
          break;
        case "ArrowUp":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setVolume(Math.min(1, volume + 0.05));
          }
          break;
        case "ArrowDown":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setVolume(Math.max(0, volume - 0.05));
          }
          break;
        case "m":
        case "M":
          if (!e.metaKey && !e.ctrlKey) {
            setVolume(volume > 0 ? 0 : 0.7);
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, playNext, playPrev, setVolume, volume]);
}
