// [VynlDJ] — extractable: Set list sidebar panel
"use client";

import React, { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import type { DjTrack } from "@/store/dj";
import Image from "next/image";

interface Props {
  setList: DjTrack[];
  currentTrackId: number | null;
  onTrackClick: (track: DjTrack) => void;
  className?: string;
}

export function DJQueuePanel({
  setList,
  currentTrackId,
  onTrackClick,
  className,
}: Props) {
  const currentRef = useRef<HTMLButtonElement>(null);

  // Scroll current track into view
  useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentTrackId]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-white/60 font-semibold text-xs uppercase tracking-wider">
          Set List
        </h3>
      </div>

      {/* Track list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {setList.map((track) => {
            const isCurrent = track.id === currentTrackId;
            const isPlayed =
              currentTrackId !== null &&
              track.position <
                (setList.find((t) => t.id === currentTrackId)?.position ?? 0);

            return (
              <button
                key={`${track.position}-${track.id}`}
                ref={isCurrent ? currentRef : null}
                onClick={() => onTrackClick(track)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg transition-colors flex items-start gap-3",
                  isCurrent
                    ? "bg-primary/20 ring-1 ring-primary/40"
                    : isPlayed
                      ? "opacity-40 hover:opacity-60"
                      : "hover:bg-white/5"
                )}
              >
                {/* Position */}
                <span
                  className={cn(
                    "text-xs font-mono w-5 shrink-0 pt-0.5 text-right",
                    isCurrent ? "text-primary" : "text-white/30"
                  )}
                >
                  {track.position + 1}
                </span>

                {/* Cover art */}
                {track.coverPath ? (
                  <Image
                    src={track.coverPath}
                    alt=""
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded bg-white/10 flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4 text-white/20" />
                  </div>
                )}

                {/* Track info */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm truncate",
                      isCurrent ? "text-white font-semibold" : "text-white/70"
                    )}
                  >
                    {track.title}
                  </p>
                  <p className="text-xs text-white/40 truncate">
                    {track.artist}
                  </p>
                  {track.djNote && (
                    <p className="text-xs text-white/25 italic mt-0.5 truncate">
                      {track.djNote}
                    </p>
                  )}
                </div>

                {/* BPM + Duration */}
                <div className="flex flex-col items-end shrink-0 gap-0.5">
                  {track.bpm != null && (() => {
                    const prevTrack = setList.find(
                      (t) => t.position === track.position - 1
                    );
                    const diff =
                      prevTrack?.bpm != null
                        ? Math.abs(track.bpm - prevTrack.bpm)
                        : null;
                    const color =
                      diff == null
                        ? "text-white/30"
                        : diff <= 10
                          ? "text-green-400/70"
                          : diff <= 20
                            ? "text-amber-400/70"
                            : "text-red-400/70";
                    return (
                      <span className={`text-xs font-mono ${color}`}>
                        {Math.round(track.bpm)}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-white/30">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
