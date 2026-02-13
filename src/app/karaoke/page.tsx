"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useLyrics } from "@/hooks/useLyrics";
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
  Disc3,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatDuration } from "@/lib/utils";

export default function KaraokePage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = React.useRef<NodeJS.Timeout>(null);

  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    playNext,
    playPrev,
    setQueue,
  } = usePlayerStore();

  const { content, format, lines, isLoading } = useLyrics();

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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Upcoming tracks (current + next ones)
  const upcomingTracks = queue.slice(queueIndex + 1, queueIndex + 20);

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
            className="object-cover scale-110 blur-3xl opacity-15"
          />
          <div className="absolute inset-0 bg-black/70" />
        </div>
      )}

      {/* Main content: split layout */}
      <div className="absolute inset-0 bottom-[100px] grid grid-cols-[380px_1fr]">
        {/* Left panel — Now playing + queue */}
        <div className="flex flex-col border-r border-white/10 overflow-hidden">
          {/* Current track hero */}
          <div className="p-6 flex flex-col items-center text-center shrink-0">
            {currentTrack?.coverPath ? (
              <motion.div
                animate={{
                  scale: isPlaying ? [1, 1.02, 1] : 1,
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-48 h-48 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/20"
              >
                <Image
                  src={currentTrack.coverPath}
                  alt=""
                  width={192}
                  height={192}
                  className="object-cover w-full h-full"
                />
              </motion.div>
            ) : (
              <div className="w-48 h-48 rounded-xl bg-white/5 flex items-center justify-center">
                <Disc3 className="w-16 h-16 text-white/20" />
              </div>
            )}
            <div className="mt-4 max-w-full">
              <p className="text-white text-lg font-bold truncate">
                {currentTrack?.title || "No track playing"}
              </p>
              <p className="text-white/60 text-sm truncate mt-0.5">
                {currentTrack?.artist}
              </p>
              <p className="text-white/30 text-xs truncate mt-0.5">
                {currentTrack?.album}
              </p>
            </div>
          </div>

          {/* Queue — up next */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2 flex items-center gap-2 text-white/40 text-xs uppercase tracking-wider shrink-0">
              <MicVocal className="h-3 w-3" />
              Up Next
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              {upcomingTracks.map((track, i) => (
                <button
                  key={`${track.id}-${queueIndex + 1 + i}`}
                  className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setQueue(queue, queueIndex + 1 + i);
                  }}
                >
                  <span className="text-white/25 text-xs w-5 text-right shrink-0">
                    {i + 1}
                  </span>
                  <div className="w-9 h-9 rounded bg-white/5 overflow-hidden shrink-0">
                    {track.coverPath ? (
                      <Image
                        src={track.coverPath}
                        alt=""
                        width={36}
                        height={36}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="w-3 h-3 text-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white/80 text-sm truncate">{track.title}</p>
                    <p className="text-white/40 text-xs truncate">{track.artist}</p>
                  </div>
                  <span className="text-white/20 text-xs shrink-0">
                    {formatDuration(track.duration)}
                  </span>
                </button>
              ))}
              {upcomingTracks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-white/20">
                  <MicVocal className="h-8 w-8 mb-2" />
                  <p className="text-sm">Queue is empty</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel — Lyrics */}
        <div className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white/30 text-xl">Loading lyrics...</div>
            </div>
          ) : (
            <LyricsDisplay
              lines={lines}
              plainText={content || undefined}
              format={format}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
            />
          )}
        </div>
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
              <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 shadow-lg">
                <Image
                  src={currentTrack.coverPath}
                  alt=""
                  width={56}
                  height={56}
                  className="object-cover w-full h-full"
                />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-lg font-bold truncate">
                {currentTrack?.title || "No track playing"}
              </p>
              <p className="text-white/60 text-sm truncate">
                {currentTrack?.artist || "Play a track to start karaoke"}
              </p>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
              onClick={(e) => { e.stopPropagation(); playPrev(); }}
            >
              <SkipBack className="h-6 w-6" />
            </Button>
            <Button
              size="icon"
              className="h-14 w-14 rounded-full bg-white text-black hover:bg-white/90"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
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
              onClick={(e) => { e.stopPropagation(); playNext(); }}
            >
              <SkipForward className="h-6 w-6" />
            </Button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <span className="text-white/50 text-sm">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>

            <Button
              variant="ghost"
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
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
