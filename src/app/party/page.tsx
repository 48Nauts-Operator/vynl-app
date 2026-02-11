"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePlayerStore } from "@/store/player";
import { useLyrics } from "@/hooks/useLyrics";
import { PartyVisualizer, type VisualizerMode } from "@/components/party/PartyVisualizer";
import { LyricsDisplay } from "@/components/party/LyricsDisplay";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize,
  Minimize,
  X,
  MicVocal,
  Tv,
  AudioWaveform,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatDuration } from "@/lib/utils";

type ViewMode = "split" | "visualizer" | "lyrics";

export default function PartyPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [vizMode, setVizMode] = useState<VisualizerMode>("bars");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = React.useRef<NodeJS.Timeout>(null);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    playNext,
    playPrev,
  } = usePlayerStore();

  const { content, format, lines, isLoading } = useLyrics();

  // Auto-switch view based on lyrics availability
  useEffect(() => {
    if (!isLoading && !content && viewMode === "split") {
      setViewMode("visualizer");
    }
    if (!isLoading && content && viewMode === "visualizer") {
      setViewMode("split");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isLoading]);

  // Mouse movement shows controls temporarily
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case "l":
          setViewMode((v) => (v === "lyrics" ? "split" : "lyrics"));
          break;
        case "v":
          setViewMode((v) => (v === "visualizer" ? "split" : "visualizer"));
          break;
        case "f":
          toggleFullscreen();
          break;
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowleft":
          playPrev();
          break;
        case "arrowright":
          playNext();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, playNext, playPrev]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const vizModes: VisualizerMode[] = ["bars", "wave", "circles", "particles"];
  const cycleViz = () => {
    setVizMode((prev) => vizModes[(vizModes.indexOf(prev) + 1) % vizModes.length]);
  };

  const cycleView = () => {
    const modes: ViewMode[] = content ? ["split", "lyrics", "visualizer"] : ["visualizer"];
    setViewMode((prev) => modes[(modes.indexOf(prev) + 1) % modes.length]);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black cursor-none"
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      {/* Blurred album art background */}
      {currentTrack?.coverPath && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <Image
            src={currentTrack.coverPath}
            alt=""
            fill
            className="object-cover scale-110 blur-3xl opacity-20"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}

      {/* Main content area */}
      <div className="absolute inset-0 bottom-[100px]">
        {viewMode === "visualizer" && (
          <div className="w-full h-full" onClick={cycleViz}>
            <PartyVisualizer vizMode={vizMode} />
            {/* Centered semi-transparent album art */}
            {currentTrack?.coverPath && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="w-64 h-64 rounded-2xl overflow-hidden shadow-2xl transition-transform duration-500"
                  style={{
                    opacity: 0.15,
                    transform: isPlaying ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  <Image
                    src={currentTrack.coverPath}
                    alt=""
                    width={256}
                    height={256}
                    className="object-cover w-full h-full"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === "lyrics" && (
          <div className="w-full h-full">
            <LyricsDisplay
              lines={lines}
              plainText={content || undefined}
              format={format}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
            />
          </div>
        )}

        {viewMode === "split" && (
          <div className="w-full h-full grid grid-cols-[40%_60%]">
            {/* Left panel — album art + mini visualizer */}
            <div className="flex flex-col items-center justify-center gap-6 p-8">
              {currentTrack?.coverPath && (
                <div className="w-80 h-80 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                  <Image
                    src={currentTrack.coverPath}
                    alt=""
                    width={320}
                    height={320}
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
              <div className="text-center max-w-[320px]">
                <p className="text-white text-2xl font-bold truncate">
                  {currentTrack?.title || "No track playing"}
                </p>
                <p className="text-white/60 text-lg truncate mt-1">
                  {currentTrack?.artist}
                </p>
                <p className="text-white/30 text-sm truncate mt-0.5">
                  {currentTrack?.album}
                </p>
              </div>
              {/* Mini visualizer */}
              <div
                className="w-80 h-24 rounded-xl overflow-hidden opacity-60"
                onClick={cycleViz}
              >
                <PartyVisualizer vizMode={vizMode} />
              </div>
            </div>

            {/* Right panel — lyrics */}
            <div className="h-full">
              <LyricsDisplay
                lines={lines}
                plainText={content || undefined}
                format={format}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-500 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div className="w-full h-1 bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between px-8 py-6">
          {/* Track info */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {currentTrack?.coverPath && (
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 shadow-lg">
                <Image
                  src={currentTrack.coverPath}
                  alt=""
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-xl font-bold truncate">
                {currentTrack?.title || "No track playing"}
              </p>
              <p className="text-white/60 truncate">
                {currentTrack?.artist || "Play a track to start the party"}
              </p>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
              onClick={playPrev}
            >
              <SkipBack className="h-6 w-6" />
            </Button>
            <Button
              size="icon"
              className="h-14 w-14 rounded-full bg-white text-black hover:bg-white/90"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
              onClick={playNext}
            >
              <SkipForward className="h-6 w-6" />
            </Button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <span className="text-white/50 text-sm">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>

            {/* View mode toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/10"
              onClick={cycleView}
              title={`View: ${viewMode}`}
            >
              {viewMode === "split" ? (
                <Tv className="h-5 w-5" />
              ) : viewMode === "lyrics" ? (
                <MicVocal className="h-5 w-5" />
              ) : (
                <AudioWaveform className="h-5 w-5" />
              )}
            </Button>

            {/* Viz mode */}
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10 text-xs uppercase tracking-wider"
              onClick={cycleViz}
            >
              {vizMode}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/10"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </Button>

            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-white/60 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
