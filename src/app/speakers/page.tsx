"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/store/player";
import {
  Speaker,
  Volume2,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RefreshCw,
  Link as LinkIcon,
  Users,
  Loader2,
  Headphones,
  Monitor,
  Laptop,
  Airplay,
  Cable,
  Check,
} from "lucide-react";
import { motion } from "framer-motion";

interface SpeakerInfo {
  name: string;
  ip: string;
  udn?: string;
  coordinatorUdn?: string;
  coordinatorName?: string;
  groupName?: string;
  model?: string;
}

interface SpeakerStatus {
  state: string;
  title?: string;
  artist?: string;
  album?: string;
  volume?: number;
}

interface AudioDevice {
  name: string;
  type: string;
  isCurrent: boolean;
}

const deviceIcon: Record<string, React.ElementType> = {
  bluetooth: Headphones,
  builtin: Laptop,
  monitor: Monitor,
  airplay: Airplay,
  virtual: Cable,
  other: Speaker,
};

export default function SpeakersPage() {
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SpeakerStatus>>({});
  const [loading, setLoading] = useState(true);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const {
    outputTarget,
    setOutputTarget,
    setSonosSpeaker,
    sonosSpeaker,
    systemDevice,
    setSystemDevice,
  } = usePlayerStore();

  const fetchSpeakers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sonos/speakers");
      const data = await res.json();
      setSpeakers(data.speakers || []);

      for (const s of data.speakers || []) {
        try {
          const statusRes = await fetch(
            `/api/sonos/status?speaker=${encodeURIComponent(s.name)}`
          );
          const status = await statusRes.json();
          setStatuses((prev) => ({ ...prev, [s.name]: status }));
        } catch {}
      }
    } catch {}
    setLoading(false);
  };

  const fetchAudioDevices = async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch("/api/audio-devices");
      const data = await res.json();
      setAudioDevices(data.devices || []);
    } catch {}
    setDevicesLoading(false);
  };

  const handleSwitchDevice = async (deviceName: string) => {
    setSwitching(deviceName);
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
        await fetchAudioDevices();
      }
    } catch {}
    setSwitching(null);
  };

  useEffect(() => {
    fetchSpeakers();
    fetchAudioDevices();
  }, []);

  // Poll Sonos status every 3s
  useEffect(() => {
    if (speakers.length === 0) return;
    const interval = setInterval(() => {
      speakers.forEach(async (s) => {
        try {
          const res = await fetch(
            `/api/sonos/status?speaker=${encodeURIComponent(s.name)}`
          );
          const status = await res.json();
          setStatuses((prev) => ({ ...prev, [s.name]: status }));
        } catch {}
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [speakers]);

  const controlSpeaker = async (speaker: string, action: string) => {
    await fetch("/api/sonos/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker, action }),
    });
  };

  const setVolume = async (speaker: string, volume: number) => {
    await fetch("/api/sonos/volume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker, volume }),
    });
  };

  const groupAll = async () => {
    if (speakers.length === 0) return;
    await fetch("/api/sonos/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "party", speaker: speakers[0].name }),
    });
    fetchSpeakers();
  };

  const groupAction = async (
    action: "join" | "leave" | "dissolve" | "party",
    payload: { speaker?: string; target?: string; coordinatorUdn?: string }
  ) => {
    await fetch("/api/sonos/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    // Give Sonos a beat to propagate the topology change, then re-fetch.
    setTimeout(fetchSpeakers, 600);
  };

  const refreshAll = () => {
    fetchSpeakers();
    fetchAudioDevices();
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Speakers & Devices</h1>
          <p className="text-muted-foreground mt-1">
            Manage Sonos speakers and system audio output
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={groupAll}>
            <Users className="h-4 w-4 mr-2" />
            Party Mode
          </Button>
          <Button variant="outline" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Sonos Speakers Section */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Speaker className="h-5 w-5" />
          Sonos Speakers
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">
              Discovering speakers...
            </span>
          </div>
        ) : speakers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Speaker className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No Sonos speakers found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Make sure your speakers are on the same network
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {(() => {
              // Compute zone groupings: speakers sharing a coordinatorUdn
              // (and with more than one member) are playing together.
              const membersByCoord = new Map<string, SpeakerInfo[]>();
              for (const s of speakers) {
                const coord = s.coordinatorUdn || s.udn;
                if (!coord) continue;
                const list = membersByCoord.get(coord) ?? [];
                list.push(s);
                membersByCoord.set(coord, list);
              }
              const groupPalette = [
                { ring: "ring-cyan-500/60", stripe: "bg-cyan-500", text: "text-cyan-400" },
                { ring: "ring-fuchsia-500/60", stripe: "bg-fuchsia-500", text: "text-fuchsia-400" },
                { ring: "ring-amber-500/60", stripe: "bg-amber-500", text: "text-amber-400" },
                { ring: "ring-sky-500/60", stripe: "bg-sky-500", text: "text-sky-400" },
                { ring: "ring-rose-500/60", stripe: "bg-rose-500", text: "text-rose-400" },
              ];
              const groupColor = new Map<string, typeof groupPalette[number]>();
              let groupIdx = 0;
              for (const [coord, members] of membersByCoord.entries()) {
                if (members.length > 1) {
                  groupColor.set(coord, groupPalette[groupIdx % groupPalette.length]);
                  groupIdx++;
                }
              }
              return speakers.map((speaker, i) => {
              const status = statuses[speaker.name];
              const isActive =
                outputTarget === "sonos" && sonosSpeaker === speaker.name;
              const isPlaying = status?.state === "PLAYING";
              const coordKey = speaker.coordinatorUdn || speaker.udn || "";
              const groupMembers = (membersByCoord.get(coordKey) ?? []).filter(
                (m) => m.udn !== speaker.udn
              );
              const groupTheme = groupColor.get(coordKey);
              const allGroupMembers = membersByCoord.get(coordKey) ?? [];
              const groupLabel = allGroupMembers.map((m) => m.name).join(" + ");

              return (
                <motion.div
                  key={speaker.udn ?? `${speaker.name}-${speaker.ip}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className={`relative overflow-hidden p-0 gap-0 transition-colors ${
                      isActive ? "border-primary ring-1 ring-primary/30" : ""
                    } ${groupTheme ? `ring-1 ${groupTheme.ring}` : ""}`}
                  >
                    {groupTheme && (
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-1 ${groupTheme.stripe}`}
                        aria-hidden
                      />
                    )}
                    {/* Speaker grille — dotted pattern, recessed feel */}
                    <button
                      type="button"
                      onClick={() => {
                        setOutputTarget("sonos");
                        setSonosSpeaker(speaker.name);
                        setSystemDevice(null);
                      }}
                      className="relative block w-full h-20 bg-neutral-900 dark:bg-neutral-950 cursor-pointer group overflow-hidden"
                      title={isActive ? "Active output" : "Set as output"}
                    >
                      <div
                        className="absolute inset-0 opacity-60"
                        style={{
                          backgroundImage:
                            "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1.4px)",
                          backgroundSize: "8px 8px",
                          backgroundPosition: "center",
                        }}
                      />
                      <div className="absolute inset-0 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]" />

                      {/* LED text display — 2 lines, scrolling */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center font-mono uppercase tracking-wider pointer-events-none">
                        {isPlaying ? (
                          <>
                            <div className="w-full overflow-hidden">
                              <p
                                className="text-[11px] leading-4 whitespace-nowrap text-emerald-400 inline-block"
                                style={{
                                  textShadow: "0 0 6px rgba(52,211,153,0.85)",
                                  animation: "led-marquee 14s linear infinite",
                                }}
                              >
                                {status?.title || "Now Playing"}&nbsp;&nbsp;&nbsp;&bull;&nbsp;&nbsp;&nbsp;
                              </p>
                            </div>
                            <div className="w-full overflow-hidden">
                              <p
                                className="text-[10px] leading-4 whitespace-nowrap text-emerald-400/80 inline-block"
                                style={{
                                  textShadow: "0 0 5px rgba(52,211,153,0.65)",
                                  animation: "led-marquee 18s linear infinite",
                                }}
                              >
                                {status?.artist || "—"}&nbsp;&nbsp;&nbsp;&bull;&nbsp;&nbsp;&nbsp;
                              </p>
                            </div>
                          </>
                        ) : (
                          <p
                            className="text-[11px] leading-4 text-red-500 text-center px-3"
                            style={{ textShadow: "0 0 6px rgba(239,68,68,0.85)" }}
                          >
                            Offline
                          </p>
                        )}
                      </div>

                      {/* LED indicator */}
                      <span
                        className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full ${
                          isPlaying
                            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse"
                            : isActive
                              ? "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.7)]"
                              : "bg-red-500/70 shadow-[0_0_4px_rgba(239,68,68,0.7)]"
                        }`}
                      />
                      {/* Active output overlay */}
                      {isActive && (
                        <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider text-amber-300/90 font-medium">
                          Output
                        </span>
                      )}
                    </button>

                    {/* Info + controls */}
                    <div className="p-3 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold truncate flex items-center gap-1">
                          {groupTheme && (
                            <LinkIcon
                              className={`h-3 w-3 shrink-0 ${groupTheme.text}`}
                            />
                          )}
                          {speaker.name}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                          {status?.state ?? "—"}
                        </span>
                      </div>

                      {groupMembers.length > 0 && groupTheme && (
                        <p
                          className={`text-[10px] uppercase tracking-wider truncate ${groupTheme.text}`}
                          title={groupLabel}
                        >
                          ▸ Group: {groupLabel}
                        </p>
                      )}

                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              title="Grouping"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuLabel className="text-xs">
                              Grouping — {speaker.name}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {groupMembers.length > 0 && (
                              <>
                                <DropdownMenuItem
                                  onClick={() =>
                                    groupAction("leave", { speaker: speaker.name })
                                  }
                                >
                                  Leave group
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
                              Join another speaker&apos;s group
                            </DropdownMenuLabel>
                            {speakers
                              .filter(
                                (other) =>
                                  other.udn !== speaker.udn &&
                                  // Don't list members of this speaker's own group
                                  (other.coordinatorUdn || other.udn) !== coordKey
                              )
                              .map((other) => (
                                <DropdownMenuItem
                                  key={other.udn ?? other.name}
                                  onClick={() =>
                                    groupAction("join", {
                                      speaker: speaker.name,
                                      target: other.coordinatorName ?? other.name,
                                    })
                                  }
                                >
                                  {other.name}
                                </DropdownMenuItem>
                              ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                groupAction("party", { speaker: speaker.name })
                              }
                            >
                              Party mode (group all)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => controlSpeaker(speaker.name, "previous")}
                        >
                          <SkipBack className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="default"
                          size="icon"
                          className="h-7 w-7 rounded-full shrink-0"
                          onClick={() =>
                            controlSpeaker(
                              speaker.name,
                              isPlaying ? "pause" : "play"
                            )
                          }
                        >
                          {isPlaying ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5 ml-0.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => controlSpeaker(speaker.name, "next")}
                        >
                          <SkipForward className="h-3.5 w-3.5" />
                        </Button>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 ml-1">
                          <Volume2 className="h-3 w-3 text-muted-foreground shrink-0" />
                          <Slider
                            value={[status?.volume ?? 50]}
                            max={100}
                            step={1}
                            onValueChange={([v]) => setVolume(speaker.name, v)}
                            className="flex-1"
                          />
                          <span className="text-[10px] text-muted-foreground w-6 text-right tabular-nums shrink-0">
                            {status?.volume ?? 50}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
              });
            })()}
          </div>
        )}
      </section>

      {/* System Audio Devices Section */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Headphones className="h-5 w-5" />
          System Audio Devices
        </h2>

        {devicesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">
              Scanning audio devices...
            </span>
          </div>
        ) : audioDevices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Headphones className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No audio devices found</p>
              <p className="text-sm text-muted-foreground mt-1">
                SwitchAudioSource may not be installed
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {audioDevices.map((device, i) => {
              const Icon = deviceIcon[device.type] || Speaker;
              const isSelected =
                outputTarget === "browser" && systemDevice === device.name;
              const isMacOSActive = device.isCurrent;

              return (
                <motion.div
                  key={`${device.name}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className={`transition-colors cursor-pointer hover:border-primary/50 ${
                      isSelected ? "border-primary" : ""
                    }`}
                    onClick={() => handleSwitchDevice(device.name)}
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        {device.name}
                      </CardTitle>
                      <div className="flex gap-1.5">
                        {isMacOSActive && (
                          <Badge variant="secondary" className="text-xs">
                            System
                          </Badge>
                        )}
                        {isSelected && (
                          <Badge variant="default" className="text-xs">
                            Vynl
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground capitalize">
                          {device.type === "builtin"
                            ? "Built-in"
                            : device.type}
                        </span>
                        {switching === device.name ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : isSelected ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
