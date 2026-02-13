// [VynlDJ] — extractable: Party configuration form
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Headphones, Clock, Users, Sparkles, Music, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DjSetupParams } from "@/lib/dj";

interface DjSessionSummary {
  id: number;
  vibe: string;
  occasion: string | null;
  trackCount: number;
  createdAt: string | null;
}

interface Props {
  onSubmit: (params: DjSetupParams) => void;
  onLoadSession: (sessionId: number) => void;
}

const AUDIENCE_OPTIONS = ["20-30s", "40-50s", "60+", "All ages"] as const;
const VIBE_OPTIONS = [
  { value: "chill", label: "Chill" },
  { value: "mixed", label: "Mixed" },
  { value: "dance", label: "Dance" },
  { value: "high_energy", label: "High Energy" },
] as const;
const DURATION_OPTIONS = [
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
  { value: 180, label: "3h" },
  { value: 240, label: "4h" },
  { value: 480, label: "Non-stop" },
] as const;
const OCCASION_OPTIONS = [
  { value: "house_party", label: "House Party" },
  { value: "dinner", label: "Dinner" },
  { value: "bbq", label: "BBQ" },
  { value: "workout", label: "Workout" },
  { value: "late_night", label: "Late Night" },
] as const;

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-sm font-medium transition-all border",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export function DJSetupForm({ onSubmit, onLoadSession }: Props) {
  const [audience, setAudience] = useState<string[]>(["All ages"]);
  const [vibe, setVibe] = useState("mixed");
  const [duration, setDuration] = useState(120);
  const [occasion, setOccasion] = useState("house_party");
  const [specialRequests, setSpecialRequests] = useState("");
  const [recentSessions, setRecentSessions] = useState<DjSessionSummary[]>([]);

  useEffect(() => {
    fetch("/api/dj/sessions")
      .then((r) => r.json())
      .then((data) => setRecentSessions(data.sessions || []))
      .catch(() => {});
  }, []);

  const toggleAudience = (value: string) => {
    setAudience((prev) => {
      if (value === "All ages") return ["All ages"];
      const without = prev.filter((v) => v !== "All ages" && v !== value);
      if (prev.includes(value)) {
        return without.length === 0 ? ["All ages"] : without;
      }
      return [...without, value];
    });
  };

  const handleSubmit = () => {
    onSubmit({
      audience,
      vibe,
      durationMinutes: duration,
      occasion,
      specialRequests: specialRequests.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Headphones className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">AI DJ</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Set up the vibe and let the AI build your perfect set
          </p>
        </div>

        <Card className="border-border/50">
          <CardContent className="p-8 space-y-8">
            {/* Audience */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-4 w-4" />
                Who&apos;s at the party?
              </label>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt}
                    label={opt}
                    selected={audience.includes(opt)}
                    onClick={() => toggleAudience(opt)}
                  />
                ))}
              </div>
            </div>

            {/* Vibe */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                What&apos;s the vibe?
              </label>
              <div className="flex flex-wrap gap-2">
                {VIBE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={vibe === opt.value}
                    onClick={() => setVibe(opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-4 w-4" />
                How long?
              </label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={duration === opt.value}
                    onClick={() => setDuration(opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Occasion */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Music className="h-4 w-4" />
                Occasion
              </label>
              <div className="flex flex-wrap gap-2">
                {OCCASION_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={occasion === opt.value}
                    onClick={() => setOccasion(opt.value)}
                  />
                ))}
              </div>
            </div>

            {/* Special Requests */}
            <div className="space-y-3">
              <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Special requests (optional)
              </label>
              <Input
                placeholder="Lots of Motown, no heavy metal, play some Queen..."
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                className="bg-secondary/30"
              />
            </div>

            {/* Submit */}
            <Button
              size="lg"
              className="w-full text-lg h-14 font-semibold"
              onClick={handleSubmit}
            >
              <Headphones className="h-5 w-5 mr-2" />
              Start the Party
            </Button>
          </CardContent>
        </Card>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="h-4 w-4" />
              Recent Sets
            </h2>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {recentSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onLoadSession(s.id)}
                    className="w-full text-left p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">
                        {s.vibe} {s.occasion?.replace("_", " ")}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {s.trackCount} tracks
                      </span>
                    </div>
                    {s.createdAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.createdAt + "Z").toLocaleDateString()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
