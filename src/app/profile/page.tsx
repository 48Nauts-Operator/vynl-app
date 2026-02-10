"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  User,
  Sparkles,
  Music,
  RefreshCw,
  BarChart3,
  Clock,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";

interface ProfileData {
  id: number;
  profileText: string;
  genreDistribution: string;
  topArtists: string;
  moodPreferences: string;
  generatedAt: string;
  feedbackCount: number;
}

interface HistoryStats {
  totalPlays: number;
  uniqueTracks: number;
  totalDuration: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<
    { title: string; artist: string; reason: string }[]
  >([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    fetch("/api/ai/profile")
      .then((r) => r.json())
      .then((d) => setProfile(d.profile))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getRecommendations = async () => {
    setLoadingRecs(true);
    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10 }),
      });
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch {}
    setLoadingRecs(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <User className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">No Taste Profile Yet</h1>
        <p className="text-muted-foreground mb-6">
          Complete a Discovery session to generate your personalized music taste
          profile.
        </p>
        <Button asChild>
          <a href="/discover">
            <Sparkles className="h-4 w-4 mr-2" />
            Start Discovery Session
          </a>
        </Button>
      </div>
    );
  }

  const genreDistribution: Record<string, number> = profile.genreDistribution
    ? JSON.parse(profile.genreDistribution)
    : {};
  const topArtists: string[] = profile.topArtists
    ? JSON.parse(profile.topArtists)
    : [];
  const moodPrefs = profile.moodPreferences
    ? JSON.parse(profile.moodPreferences)
    : {};

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Taste Profile</h1>
          <p className="text-muted-foreground mt-1">
            Based on {profile.feedbackCount} ratings · Generated{" "}
            {new Date(profile.generatedAt!).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/discover">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Profile
          </a>
        </Button>
      </div>

      {/* Profile Text */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Your Music Identity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {profile.profileText}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Genre Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Genre Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(genreDistribution)
              .sort(([, a], [, b]) => b - a)
              .map(([genre, pct]) => (
                <div key={genre} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{genre}</span>
                    <span className="text-muted-foreground">{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Top Artists & Mood */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                Top Artists
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topArtists.map((artist) => (
                  <Badge key={artist} variant="secondary" className="text-sm">
                    {artist}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mood Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(moodPrefs).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between text-sm"
                >
                  <span className="capitalize">{key}</span>
                  <Badge variant="outline">{String(value)}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI Recommendations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Recommendations
          </CardTitle>
          <Button onClick={getRecommendations} disabled={loadingRecs}>
            {loadingRecs ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Get Recommendations
          </Button>
        </CardHeader>
        <CardContent>
          {recommendations.length > 0 ? (
            <div className="space-y-3">
              {recommendations.map((rec, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/30"
                >
                  <span className="text-lg font-bold text-primary w-6">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">
                      {rec.title}{" "}
                      <span className="text-muted-foreground font-normal">
                        by {rec.artist}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rec.reason}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Click &quot;Get Recommendations&quot; to discover new music based
              on your taste profile.
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
