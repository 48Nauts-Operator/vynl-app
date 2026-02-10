"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { motion } from "framer-motion";

interface SpeakerInfo {
  name: string;
  ip: string;
  model?: string;
}

interface SpeakerStatus {
  state: string;
  title?: string;
  artist?: string;
  album?: string;
  volume?: number;
}

export default function SpeakersPage() {
  const [speakers, setSpeakers] = useState<SpeakerInfo[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SpeakerStatus>>({});
  const [loading, setLoading] = useState(true);
  const { setOutputTarget, setSonosSpeaker, sonosSpeaker } = usePlayerStore();

  const fetchSpeakers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sonos/speakers");
      const data = await res.json();
      setSpeakers(data.speakers || []);

      // Fetch status for each speaker
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

  useEffect(() => {
    fetchSpeakers();
  }, []);

  // Poll status every 3s
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
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Speakers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Sonos speakers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={groupAll}>
            <Users className="h-4 w-4 mr-2" />
            Party Mode
          </Button>
          <Button variant="outline" onClick={fetchSpeakers}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">
            Discovering speakers...
          </span>
        </div>
      ) : speakers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Speaker className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground">
              No Sonos speakers found
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Make sure your Sonos speakers are on the same network
            </p>
            <Button className="mt-4" onClick={fetchSpeakers}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {speakers.map((speaker, i) => {
            const status = statuses[speaker.name];
            const isActive = sonosSpeaker === speaker.name;

            return (
              <motion.div
                key={speaker.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card
                  className={`transition-colors ${isActive ? "border-primary" : ""}`}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Speaker className="h-5 w-5" />
                      {speaker.name}
                    </CardTitle>
                    <Badge
                      variant={
                        status?.state === "PLAYING"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {status?.state || "Unknown"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {status?.title && (
                      <div className="text-sm">
                        <p className="font-medium truncate">{status.title}</p>
                        <p className="text-muted-foreground truncate">
                          {status.artist}
                        </p>
                      </div>
                    )}

                    {/* Transport controls */}
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          controlSpeaker(speaker.name, "previous")
                        }
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="icon"
                        className="h-9 w-9 rounded-full"
                        onClick={() =>
                          controlSpeaker(
                            speaker.name,
                            status?.state === "PLAYING" ? "pause" : "play"
                          )
                        }
                      >
                        {status?.state === "PLAYING" ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4 ml-0.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => controlSpeaker(speaker.name, "next")}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                      <Slider
                        value={[status?.volume || 50]}
                        max={100}
                        step={1}
                        onValueChange={([v]) => setVolume(speaker.name, v)}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-8 text-right">
                        {status?.volume || 50}%
                      </span>
                    </div>

                    {/* Select as output */}
                    <Button
                      variant={isActive ? "default" : "outline"}
                      className="w-full"
                      onClick={() => {
                        setOutputTarget("sonos");
                        setSonosSpeaker(speaker.name);
                      }}
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {isActive ? "Active Output" : "Set as Output"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
