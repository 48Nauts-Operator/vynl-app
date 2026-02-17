// [VynlDJ] — extractable: Full-screen DJ playback experience
"use client";

import React, { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { usePlayerStore } from "@/store/player";
import { useDjStore, type DjTrack } from "@/store/dj";
import { DJQueuePanel } from "./DJQueuePanel";
import { Button } from "@/components/ui/button";
import { DJPreviewControls } from "./DJPreviewControls";
import { useDJCrossfade } from "@/hooks/useDJCrossfade";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  Headphones,
  FastForward,
  Music,
  Clock,
  Disc3,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatDuration } from "@/lib/utils";

// [VynlDJ] — extractable: energy phase derivation from set position
function getSetPhase(position: number, total: number): { label: string; emoji: string } {
  const pct = total > 0 ? position / total : 0;
  if (pct < 0.10) return { label: "Opening", emoji: "\u{1F305}" };
  if (pct < 0.25) return { label: "Warming Up", emoji: "\u{1F525}" };
  if (pct < 0.40) return { label: "Building Energy", emoji: "\u{1F4C8}" };
  if (pct < 0.55) return { label: "Peak Time", emoji: "\u{26A1}" };
  if (pct < 0.65) return { label: "Breather", emoji: "\u{1F30A}" };
  if (pct < 0.80) return { label: "Second Peak", emoji: "\u{1F680}" };
  if (pct < 0.90) return { label: "Winding Down", emoji: "\u{1F319}" };
  return { label: "Grand Finale", emoji: "\u{1F386}" };
}

interface Props {
  onExit: () => void;
}

export function DJPlaybackScreen({ onExit }: Props) {
  const [showControls, setShowControls] = useState(true);
  const controlsTimeout = React.useRef<NodeJS.Timeout>(null);

  // Dual-deck crossfade engine — only active during preview mode
  useDJCrossfade();

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    queueIndex,
    queue,
    previewMode,
    crossfadeProgress,
    togglePlay,
    playNext,
    playPrev,
    setQueue,
  } = usePlayerStore();

  const { session, setList } = useDjStore();

  // Find the current track's DJ metadata
  const currentDjTrack = useMemo(() => {
    if (!currentTrack) return null;
    return setList.find((t) => t.id === currentTrack.id) ?? null;
  }, [currentTrack, setList]);

  // Upcoming tracks (next 3 for left panel)
  const upNext = useMemo(() => {
    if (queueIndex < 0) return [];
    return setList
      .filter((t) => t.position > (currentDjTrack?.position ?? -1))
      .slice(0, 3);
  }, [setList, queueIndex, currentDjTrack]);

  // Set progress stats
  const setProgress = useMemo(() => {
    const currentPos = currentDjTrack?.position ?? 0;
    const total = setList.length;
    const remainingDuration =
      setList
        .filter((t) => t.position > currentPos)
        .reduce((sum, t) => sum + t.duration, 0) +
      Math.max(0, (currentTrack?.duration ?? 0) - currentTime);
    return {
      current: currentPos + 1,
      total,
      remainingMinutes: Math.round(remainingDuration / 60),
      pct: total > 0 ? ((currentPos + 1) / total) * 100 : 0,
    };
  }, [setList, currentDjTrack, currentTrack, currentTime]);

  // Energy phase from position
  const phase = useMemo(
    () => getSetPhase(currentDjTrack?.position ?? 0, setList.length),
    [currentDjTrack, setList.length]
  );

  // Mouse movement shows controls
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  // Jump to a specific track in the set
  const jumpToTrack = useCallback(
    (djTrack: DjTrack) => {
      const idx = queue.findIndex((q) => q.id === djTrack.id);
      if (idx >= 0) {
        setQueue(queue, idx);
      }
    },
    [queue, setQueue]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      {/* Blurred album art backdrop */}
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

      {/* Main content — hero + split panels */}
      <div className="absolute inset-0 bottom-[100px] flex flex-col">
        {/* ── Hero Row ── */}
        <div className="shrink-0 flex items-center gap-5 px-8 pt-6 pb-4">
          {/* Cover art (compact) */}
          {currentTrack?.coverPath ? (
            <motion.div
              animate={{ scale: isPlaying ? [1, 1.02, 1] : 1 }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 shrink-0"
            >
              <Image
                src={currentTrack.coverPath}
                alt=""
                width={80}
                height={80}
                className="object-cover w-full h-full"
              />
            </motion.div>
          ) : (
            <div className="w-20 h-20 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <Headphones className="w-8 h-8 text-white/20" />
            </div>
          )}

          {/* Track info */}
          <div className="min-w-0 flex-1">
            <h2 className="text-white text-2xl font-bold truncate">
              {currentTrack?.title || "No track"}
            </h2>
            <p className="text-white/60 text-base truncate">
              {currentTrack?.artist}
              {currentTrack?.album && (
                <span className="text-white/30"> &middot; {currentTrack.album}</span>
              )}
            </p>
            {/* BPM / Energy / Key badges */}
            {currentDjTrack?.bpm != null && (
              <div className="flex items-center gap-3 mt-1.5 text-sm">
                <span className="font-mono text-white/50">
                  {Math.round(currentDjTrack.bpm)} BPM
                </span>
                {currentDjTrack.energy != null && (
                  <span className="text-white/50">
                    Energy {Math.round(currentDjTrack.energy * 10)}/10
                  </span>
                )}
                {currentDjTrack.key && (
                  <span className="text-white/40">{currentDjTrack.key}</span>
                )}
                {currentDjTrack.camelot && (
                  <span className="text-xs bg-white/10 text-white/50 px-1.5 py-0.5 rounded">
                    {currentDjTrack.camelot}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-white/10" />

        {/* ── Split Panels ── */}
        <div className="flex-1 flex min-h-0">
          {/* ── Left Panel: Set Info ── */}
          <div className="w-[40%] flex flex-col gap-5 px-8 py-5 overflow-y-auto">
            {/* Phase card */}
            <div className="flex items-center gap-3">
              <span className="text-2xl">{phase.emoji}</span>
              <div>
                <p className="text-white font-semibold text-lg">{phase.label}</p>
                <p className="text-white/40 text-xs uppercase tracking-wider">Set Phase</p>
              </div>
            </div>

            {/* DJ note for current track */}
            {currentDjTrack?.djNote && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={currentDjTrack.id}
                className="px-4 py-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10"
              >
                <p className="text-white/70 text-sm italic">
                  &ldquo;{currentDjTrack.djNote}&rdquo;
                </p>
              </motion.div>
            )}

            {/* Track progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
                <span>Track {setProgress.current}/{setProgress.total}</span>
                <span>{setProgress.remainingMinutes}m remaining</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${setProgress.pct}%` }}
                />
              </div>
            </div>

            {/* Session stats */}
            {session && (
              <div className="grid grid-cols-2 gap-3">
                {session.vibe && (
                  <div className="flex items-center gap-2 text-white/40 text-sm">
                    <Disc3 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{session.vibe}</span>
                  </div>
                )}
                {session.occasion && (
                  <div className="flex items-center gap-2 text-white/40 text-sm">
                    <Music className="h-4 w-4 shrink-0" />
                    <span className="truncate">{session.occasion}</span>
                  </div>
                )}
                {session.durationMinutes != null && (
                  <div className="flex items-center gap-2 text-white/40 text-sm">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>{session.durationMinutes}m set</span>
                  </div>
                )}
              </div>
            )}

            {/* Up Next */}
            {upNext.length > 0 && (
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wider mb-2">
                  Up Next
                </p>
                <div className="space-y-1.5">
                  {upNext.map((track, idx) => {
                    const prevBpm = idx === 0
                      ? currentDjTrack?.bpm
                      : upNext[idx - 1]?.bpm;
                    const bpmDiff = prevBpm != null && track.bpm != null
                      ? Math.abs(track.bpm - prevBpm)
                      : null;
                    const bpmColor = bpmDiff == null
                      ? "text-white/30"
                      : bpmDiff <= 10
                        ? "text-green-400/70"
                        : bpmDiff <= 20
                          ? "text-amber-400/70"
                          : "text-red-400/70";

                    return (
                      <div
                        key={track.id}
                        className="flex items-center gap-3 text-white/50 text-sm"
                      >
                        {track.coverPath ? (
                          <Image
                            src={track.coverPath}
                            alt=""
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-white/10" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-white/70">{track.title}</p>
                          <p className="truncate text-white/40 text-xs">
                            {track.artist}
                          </p>
                        </div>
                        {track.bpm != null && (
                          <span className={`text-xs font-mono shrink-0 ${bpmColor}`}>
                            {Math.round(track.bpm)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Session DJ notes */}
            {session?.djNotes && (
              <div className="mt-auto pt-4 border-t border-white/5">
                <div className="flex items-start gap-2 text-white/30 text-xs">
                  <Headphones className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p>{session.djNotes}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Vertical divider ── */}
          <div className="w-px bg-white/10" />

          {/* ── Right Panel: Set List ── */}
          <DJQueuePanel
            setList={setList}
            currentTrackId={currentTrack?.id ?? null}
            onTrackClick={jumpToTrack}
            className="flex-1 min-w-0"
          />
        </div>
      </div>

      {/* ── Bottom Controls ── */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-500 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div className="w-full h-1 bg-white/10">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between px-8 py-5">
          {/* Left: track info compact */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {currentTrack?.coverPath && (
              <Image
                src={currentTrack.coverPath}
                alt=""
                width={48}
                height={48}
                className="w-12 h-12 rounded-lg object-cover shadow-lg"
              />
            )}
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">
                {currentTrack?.title}
              </p>
              <p className="text-white/50 text-sm truncate">
                {currentTrack?.artist}
              </p>
            </div>
          </div>

          {/* Center: playback */}
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

          {/* Right: controls */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <DJPreviewControls />
            <span className="text-white/40 text-sm">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
            <Link href="/" onClick={onExit}>
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

      {/* Preview mode banner */}
      {previewMode && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-amber-400/10 border-b border-amber-400/20 px-4 py-2">
          <div className="flex items-center justify-center gap-2 text-amber-400 text-sm">
            <FastForward className="h-4 w-4" />
            <span className="font-medium">PREVIEW MODE</span>
            {crossfadeProgress > 0 ? (
              <>
                <span className="text-amber-400/80">Crossfading...</span>
                <div className="w-20 h-1.5 bg-amber-400/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${crossfadeProgress * 100}%`, transition: "width 50ms linear" }}
                  />
                </div>
              </>
            ) : (
              <span className="text-amber-400/60">Testing transitions</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
