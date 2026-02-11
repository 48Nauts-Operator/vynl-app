"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Download,
  Brain,
  Sparkles,
  FileText,
  Loader2,
  CheckCircle,
  ArrowLeft,
  Clock,
  Podcast,
} from "lucide-react";
import { usePlayerStore, type Track } from "@/store/player";
import { formatPodcastDuration } from "@/lib/utils";

interface EpisodeData {
  id: number;
  podcastId: number;
  title: string;
  description: string | null;
  pubDate: string | null;
  duration: number | null;
  audioUrl: string;
  localPath: string | null;
  isDownloaded: boolean;
  playPosition: number | null;
  coverPath: string | null;
}

interface Insight {
  id: number;
  type: "summary" | "wisdom" | "transcript";
  content: string;
  generatedAt: string;
}

export default function EpisodeDetailPage() {
  const { id, episodeId } = useParams();
  const router = useRouter();
  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const { setTrack } = usePlayerStore();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/podcasts/${id}/episodes/${episodeId}`);
      const data = await res.json();
      setEpisode(data.episode);
      setInsights(data.insights || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id, episodeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePlay = () => {
    if (!episode) return;
    const track: Track = {
      id: episode.id + 100000,
      title: episode.title,
      artist: "Podcast",
      album: "Podcast",
      duration: episode.duration || 0,
      filePath: episode.localPath || undefined,
      coverPath: episode.coverPath || undefined,
      source: "podcast",
      streamUrl: !episode.localPath ? episode.audioUrl : undefined,
      podcastEpisodeId: episode.id,
    };
    setTrack(track);
  };

  const handleDownload = async () => {
    if (!episode) return;
    setDownloading(true);
    try {
      await fetch(`/api/podcasts/${id}/episodes/${episodeId}/download`, {
        method: "POST",
      });
      const poll = setInterval(async () => {
        const res = await fetch(
          `/api/podcasts/${id}/episodes/${episodeId}/download`
        );
        const data = await res.json();
        if (data.status === "complete" || data.status === "error") {
          clearInterval(poll);
          setDownloading(false);
          fetchData();
        }
      }, 2000);
    } catch {
      setDownloading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!episode) return;
    setAnalyzing(true);
    setAnalysisStep("Starting...");
    try {
      await fetch(`/api/podcasts/${id}/episodes/${episodeId}/analyze`, {
        method: "POST",
      });
      const poll = setInterval(async () => {
        const res = await fetch(
          `/api/podcasts/${id}/episodes/${episodeId}/analyze`
        );
        const data = await res.json();
        setAnalysisStep(data.step || "");
        if (data.status === "complete" || data.status === "error") {
          clearInterval(poll);
          setAnalyzing(false);
          fetchData();
        }
      }, 3000);
    } catch {
      setAnalyzing(false);
    }
  };

  const summary = insights.find((i) => i.type === "summary");
  const wisdom = insights.find((i) => i.type === "wisdom");
  const transcript = insights.find((i) => i.type === "transcript");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="p-6">
        <p>Episode not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/podcasts/${id}`)}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Episodes
      </Button>

      {/* Episode header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-6"
      >
        <div className="w-40 h-40 rounded-xl overflow-hidden shrink-0 bg-muted">
          {episode.coverPath ? (
            <Image
              src={episode.coverPath}
              alt={episode.title}
              width={160}
              height={160}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Podcast className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
        </div>
        <div className="flex flex-col justify-end min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{episode.title}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatPodcastDuration(episode.duration)}
            </span>
            {episode.pubDate && (
              <span>
                {new Date(episode.pubDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
            {episode.isDownloaded && (
              <Badge variant="secondary">
                <CheckCircle className="h-3 w-3 mr-1" />
                Downloaded
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Button onClick={handlePlay}>
              <Play className="h-4 w-4 mr-2" />
              Play
            </Button>
            {!episode.isDownloaded && (
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {downloading ? "Downloading..." : "Download"}
              </Button>
            )}
            {episode.isDownloaded && !analyzing && insights.length === 0 && (
              <Button variant="outline" onClick={handleAnalyze}>
                <Brain className="h-4 w-4 mr-2" />
                Analyze with AI
              </Button>
            )}
          </div>
          {analyzing && (
            <div className="flex items-center gap-2 mt-3 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              {analysisStep}
            </div>
          )}
        </div>
      </motion.div>

      <Separator />

      {/* AI Summary */}
      {summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
              {summary.content}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extracted Wisdom */}
      {wisdom && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Key Insights & Wisdom
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
              {wisdom.content}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show Notes */}
      {episode.description && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Show Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{episode.description}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript (collapsible) */}
      {transcript && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Transcript
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript(!showTranscript)}
              >
                {showTranscript ? "Collapse" : "Expand"}
              </Button>
            </div>
          </CardHeader>
          {showTranscript && (
            <CardContent>
              <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                {transcript.content}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
