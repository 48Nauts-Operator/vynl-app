"use client";

import { useState, useEffect } from "react";
import { usePlayerStore } from "@/store/player";

export interface LyricLine {
  time: number;
  text: string;
}

interface LyricsState {
  content: string | null;
  format: "lrc" | "plain" | null;
  source: string | null;
  lines: LyricLine[];
  isLoading: boolean;
}

export function useLyrics() {
  const { currentTrack } = usePlayerStore();
  const [state, setState] = useState<LyricsState>({
    content: null,
    format: null,
    source: null,
    lines: [],
    isLoading: false,
  });

  useEffect(() => {
    if (!currentTrack) {
      setState({ content: null, format: null, source: null, lines: [], isLoading: false });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, isLoading: true }));

    const params = new URLSearchParams({
      trackId: String(currentTrack.id),
      artist: currentTrack.artist || "",
      title: currentTrack.title || "",
      album: currentTrack.album || "",
      filePath: currentTrack.filePath || "",
      duration: String(currentTrack.duration || 0),
    });

    fetch(`/api/lyrics?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setState({
          content: data.content,
          format: data.format,
          source: data.source,
          lines: data.lines || [],
          isLoading: false,
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setState({ content: null, format: null, source: null, lines: [], isLoading: false });
        }
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  return state;
}
