// [VynlDJ] — extractable: AI DJ party page with setup → generating → playback flow
"use client";

import React, { useEffect, useCallback } from "react";
import { useState } from "react";
import { useDjStore } from "@/store/dj";
import { usePlayerStore } from "@/store/player";
import { DJSetupForm } from "@/components/dj/DJSetupForm";
import { DJLoadingScreen } from "@/components/dj/DJLoadingScreen";
import { DJPlaybackScreen } from "@/components/dj/DJPlaybackScreen";
import type { DjSetupParams } from "@/lib/dj";

type Phase = "setup" | "generating" | "playing" | "error";

export default function PartyPage() {
  const [phase, setPhase] = useState<Phase>("setup");

  const { session, setList, isGenerating, error, generateSet, loadSession, clearSession } =
    useDjStore();
  const { setQueue } = usePlayerStore();

  // Sync phase with store state
  useEffect(() => {
    if (isGenerating) {
      setPhase("generating");
    } else if (error) {
      setPhase("error");
    } else if (session && setList.length > 0) {
      setPhase("playing");
    } else if (session && setList.length === 0) {
      // Generation completed but returned no tracks — treat as error
      setPhase("error");
    }
  }, [isGenerating, error, session, setList]);

  // When set is ready, load tracks into player queue
  useEffect(() => {
    if (phase === "playing" && setList.length > 0) {
      // Convert DjTrack[] to player Track[] and start playback
      const playerTracks = setList.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        albumArtist: t.albumArtist,
        duration: t.duration,
        filePath: t.filePath,
        coverPath: t.coverPath,
        source: t.source,
        sourceId: t.sourceId,
      }));
      setQueue(playerTracks, 0);
    }
  }, [phase, setList, setQueue]);

  const handleGenerate = useCallback(
    (params: DjSetupParams) => {
      generateSet(params);
    },
    [generateSet]
  );

  const handleLoadSession = useCallback(
    (sessionId: number) => {
      loadSession(sessionId);
    },
    [loadSession]
  );

  const handleExit = useCallback(() => {
    clearSession();
    setPhase("setup");
  }, [clearSession]);

  const handleRetry = useCallback(() => {
    clearSession();
    setPhase("setup");
  }, [clearSession]);

  switch (phase) {
    case "setup":
      return (
        <DJSetupForm onSubmit={handleGenerate} onLoadSession={handleLoadSession} />
      );

    case "generating":
      return <DJLoadingScreen />;

    case "playing":
      return <DJPlaybackScreen onExit={handleExit} />;

    case "error":
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold text-destructive">
              DJ had a problem
            </h2>
            <p className="text-muted-foreground max-w-md">
              {error || "Could not build a set from the available tracks. Try different settings or a broader special request."}
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
  }
}
