"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { usePlayerStore } from "@/store/player";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Volume1,
  Repeat,
  Repeat1,
  Shuffle,
  Speaker,
  Monitor,
  Music,
} from "lucide-react";

interface SonosSpeakerInfo {
  name: string;
  ip: string;
}

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    outputTarget,
    sonosSpeaker,
    shuffled,
    repeatMode,
    togglePlay,
    playNext,
    playPrev,
    setVolume,
    setOutputTarget,
    setSonosSpeaker,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore();

  const { seek } = useAudioPlayer();
  useKeyboardShortcuts();

  const [speakers, setSpeakers] = useState<SonosSpeakerInfo[]>([]);

  // Fetch Sonos speakers
  useEffect(() => {
    fetch("/api/sonos/speakers")
      .then((r) => r.json())
      .then((data) => setSpeakers(data.speakers || []))
      .catch(() => {});
  }, []);

  const VolumeIcon =
    volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="h-[90px] bg-[#181818] border-t border-border flex items-center px-4 gap-4">
      {/* Left: Now Playing */}
      <div className="flex items-center gap-3 w-[280px] min-w-[180px]">
        {currentTrack ? (
          <>
            <div className="w-14 h-14 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
              {currentTrack.coverPath ? (
                <Image
                  src={currentTrack.coverPath}
                  alt={currentTrack.album}
                  width={56}
                  height={56}
                  className="object-cover"
                />
              ) : (
                <Music className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentTrack.artist}
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded bg-secondary flex items-center justify-center">
              <Music className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Not playing</p>
          </div>
        )}
      </div>

      {/* Center: Controls + Progress */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-[600px] mx-auto">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", shuffled && "text-primary")}
            onClick={toggleShuffle}
          >
            <Shuffle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={playPrev}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={togglePlay}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={playNext}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              repeatMode !== "off" && "text-primary"
            )}
            onClick={cycleRepeat}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-muted-foreground w-10 text-right">
            {formatDuration(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={1}
            onValueChange={([val]) => seek(val)}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-10">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Right: Volume + Speaker */}
      <div className="flex items-center gap-2 w-[280px] min-w-[180px] justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8",
                outputTarget === "sonos" && "text-primary"
              )}
            >
              {outputTarget === "sonos" ? (
                <Speaker className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Output Device</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setOutputTarget("browser");
                setSonosSpeaker(null);
              }}
              className={cn(outputTarget === "browser" && "text-primary")}
            >
              <Monitor className="h-4 w-4 mr-2" />
              This Device
            </DropdownMenuItem>
            {speakers.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Sonos Speakers</DropdownMenuLabel>
                {speakers.map((s) => (
                  <DropdownMenuItem
                    key={s.name}
                    onClick={() => {
                      setOutputTarget("sonos");
                      setSonosSpeaker(s.name);
                    }}
                    className={cn(
                      sonosSpeaker === s.name && "text-primary"
                    )}
                  >
                    <Speaker className="h-4 w-4 mr-2" />
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setVolume(volume > 0 ? 0 : 0.7)}
        >
          <VolumeIcon className="h-4 w-4" />
        </Button>
        <Slider
          value={[volume * 100]}
          max={100}
          step={1}
          onValueChange={([val]) => setVolume(val / 100)}
          className="w-24"
        />
      </div>
    </div>
  );
}
