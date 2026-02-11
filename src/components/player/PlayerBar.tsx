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
  Headphones,
  Laptop,
  Airplay,
  Cable,
  Check,
} from "lucide-react";

interface SonosSpeakerInfo {
  name: string;
  ip: string;
}

interface AudioDeviceInfo {
  name: string;
  type: string;
  isCurrent: boolean;
}

const deviceIconMap: Record<string, React.ElementType> = {
  bluetooth: Headphones,
  builtin: Laptop,
  monitor: Monitor,
  airplay: Airplay,
  virtual: Cable,
  other: Speaker,
};

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    outputTarget,
    sonosSpeaker,
    systemDevice,
    shuffled,
    repeatMode,
    togglePlay,
    playNext,
    playPrev,
    setVolume,
    setOutputTarget,
    setSonosSpeaker,
    setSystemDevice,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore();

  const { seek } = useAudioPlayer();
  useKeyboardShortcuts();

  const [speakers, setSpeakers] = useState<SonosSpeakerInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);

  useEffect(() => {
    fetch("/api/sonos/speakers")
      .then((r) => r.json())
      .then((data) => setSpeakers(data.speakers || []))
      .catch(() => {});

    fetch("/api/audio-devices")
      .then((r) => r.json())
      .then((data) => setAudioDevices(data.devices || []))
      .catch(() => {});
  }, []);

  const handleSwitchAudioDevice = async (deviceName: string) => {
    try {
      const res = await fetch("/api/audio-devices/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceName }),
      });
      const data = await res.json();
      if (data.switched) {
        setOutputTarget("browser");
        setSonosSpeaker(null);
        setSystemDevice(data.device);
        // Refresh device list to update isCurrent
        const refreshRes = await fetch("/api/audio-devices");
        const refreshData = await refreshRes.json();
        setAudioDevices(refreshData.devices || []);
      }
    } catch {}
  };

  const VolumeIcon =
    volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Determine which icon to show for the output button
  const getOutputIcon = () => {
    if (outputTarget === "sonos") return Speaker;
    if (systemDevice) {
      const device = audioDevices.find((d) => d.name === systemDevice);
      if (device) return deviceIconMap[device.type] || Monitor;
    }
    return Monitor;
  };
  const OutputIcon = getOutputIcon();

  // Label shown next to output icon
  const outputLabel =
    outputTarget === "sonos"
      ? sonosSpeaker
      : systemDevice || "This Device";

  return (
    <div className="h-[90px] bg-[#181818] border-t border-border flex items-center px-4 gap-4" style={{ "--color-primary": "var(--color-player-green)", "--color-primary-foreground": "#000000" } as React.CSSProperties}>
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
              size="sm"
              className={cn(
                "h-8 gap-1.5 px-2 max-w-[140px]",
                outputTarget === "sonos" && "text-primary"
              )}
            >
              <OutputIcon className="h-4 w-4 shrink-0" />
              <span className="text-xs truncate">{outputLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Output Device</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* System Audio Devices */}
            {audioDevices.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  System Audio
                </DropdownMenuLabel>
                {audioDevices.map((d, i) => {
                  const Icon = deviceIconMap[d.type] || Speaker;
                  const isActive =
                    outputTarget === "browser" && systemDevice === d.name;
                  return (
                    <DropdownMenuItem
                      key={`${d.name}-${i}`}
                      onClick={() => handleSwitchAudioDevice(d.name)}
                      className={cn(isActive && "text-primary")}
                    >
                      <Icon className="h-4 w-4 mr-2 shrink-0" />
                      <span className="truncate">{d.name}</span>
                      {isActive && (
                        <Check className="h-3 w-3 ml-auto shrink-0" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}

            {/* Fallback "This Device" if no audio devices found */}
            {audioDevices.length === 0 && (
              <DropdownMenuItem
                onClick={() => {
                  setOutputTarget("browser");
                  setSonosSpeaker(null);
                  setSystemDevice(null);
                }}
                className={cn(
                  outputTarget === "browser" && !systemDevice && "text-primary"
                )}
              >
                <Monitor className="h-4 w-4 mr-2" />
                This Device
              </DropdownMenuItem>
            )}

            {/* Sonos Speakers */}
            {speakers.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Sonos Speakers
                </DropdownMenuLabel>
                {speakers.map((s) => {
                  const isActive =
                    outputTarget === "sonos" && sonosSpeaker === s.name;
                  return (
                    <DropdownMenuItem
                      key={s.name}
                      onClick={() => {
                        setOutputTarget("sonos");
                        setSonosSpeaker(s.name);
                        setSystemDevice(null);
                      }}
                      className={cn(isActive && "text-primary")}
                    >
                      <Speaker className="h-4 w-4 mr-2 shrink-0" />
                      <span className="truncate">{s.name}</span>
                      {isActive && (
                        <Check className="h-3 w-3 ml-auto shrink-0" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
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
