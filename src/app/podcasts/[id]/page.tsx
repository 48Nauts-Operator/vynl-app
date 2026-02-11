"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  RefreshCw,
  Trash2,
  Download,
  CheckCircle,
  Loader2,
  Podcast,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { usePlayerStore, type Track } from "@/store/player";
import { formatPodcastDuration } from "@/lib/utils";

interface PodcastInfo {
  id: number;
  title: string;
  author: string | null;
  description: string | null;
  feedUrl: string;
  coverPath: string | null;
  lastFetchedAt: string | null;
}

interface Episode {
  id: number;
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

function episodeToTrack(ep: Episode, podcast: PodcastInfo): Track {
  return {
    id: ep.id + 100000,
    title: ep.title,
    artist: podcast.title,
    album: podcast.title,
    duration: ep.duration || 0,
    filePath: ep.localPath || undefined,
    coverPath: ep.coverPath || podcast.coverPath || undefined,
    source: "podcast",
    streamUrl: !ep.localPath ? ep.audioUrl : undefined,
    podcastEpisodeId: ep.id,
  };
}

export default function PodcastDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [podcast, setPodcast] = useState<PodcastInfo | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { setQueue } = usePlayerStore();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/podcasts/${id}`);
      const data = await res.json();
      setPodcast(data.podcast);
      setEpisodes(data.episodes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch(`/api/podcasts/${id}/refresh`, { method: "POST" });
    await fetchData();
    setRefreshing(false);
  };

  const handleUnsubscribe = async () => {
    await fetch(`/api/podcasts/${id}`, { method: "DELETE" });
    router.push("/podcasts");
  };

  const handlePlayEpisode = (episode: Episode, index: number) => {
    if (!podcast) return;
    const tracks = episodes.map((ep) => episodeToTrack(ep, podcast));
    setQueue(tracks, index);
  };

  const handlePlayLatest = () => {
    if (episodes.length > 0) handlePlayEpisode(episodes[0], 0);
  };

  const handleDownload = async (episode: Episode) => {
    setDownloadingId(episode.id);
    try {
      await fetch(
        `/api/podcasts/${id}/episodes/${episode.id}/download`,
        { method: "POST" }
      );
      // Poll until complete
      const poll = setInterval(async () => {
        const res = await fetch(
          `/api/podcasts/${id}/episodes/${episode.id}/download`
        );
        const data = await res.json();
        if (data.status === "complete" || data.status === "error") {
          clearInterval(poll);
          setDownloadingId(null);
          fetchData();
        }
      }, 2000);
    } catch {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!podcast) {
    return (
      <div className="p-6">
        <p>Podcast not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/podcasts")}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Podcasts
      </Button>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-6"
      >
        <div className="w-56 h-56 rounded-xl overflow-hidden shrink-0 bg-muted shadow-lg">
          {podcast.coverPath ? (
            <Image
              src={podcast.coverPath}
              alt={podcast.title}
              width={224}
              height={224}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Podcast className="h-20 w-20 text-muted-foreground/30" />
            </div>
          )}
        </div>
        <div className="flex flex-col justify-end min-w-0 flex-1">
          <Badge variant="secondary" className="w-fit mb-2">
            Podcast
          </Badge>
          <h1 className="text-3xl font-bold">{podcast.title}</h1>
          {podcast.author && (
            <p className="text-lg text-muted-foreground mt-1">{podcast.author}</p>
          )}
          <p className="text-sm text-muted-foreground/60 mt-1">
            {episodes.length} episode{episodes.length !== 1 ? "s" : ""}
          </p>
          {podcast.description && (
            <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
              {podcast.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-4">
            <Button onClick={handlePlayLatest} disabled={episodes.length === 0}>
              <Play className="h-4 w-4 mr-2" />
              Play Latest
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
            <Button variant="outline" onClick={handleUnsubscribe}>
              <Trash2 className="h-4 w-4 mr-2" />
              Unsubscribe
            </Button>
          </div>
        </div>
      </motion.div>

      <Separator />

      {/* Episodes */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Episodes</h2>
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {episodes.map((ep, index) => (
              <div
                key={ep.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/30 transition-colors group"
              >
                {/* Play button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-10 w-10 rounded-full"
                  onClick={() => handlePlayEpisode(ep, index)}
                >
                  <Play className="h-4 w-4" />
                </Button>

                {/* Title + date */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/podcasts/${id}/episodes/${ep.id}`}
                    className="text-sm font-medium hover:underline truncate block"
                  >
                    {ep.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ep.pubDate
                      ? new Date(ep.pubDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "Unknown date"}
                  </p>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {formatPodcastDuration(ep.duration)}
                </div>

                {/* Download status */}
                <div className="shrink-0">
                  {ep.isDownloaded ? (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Downloaded
                    </Badge>
                  ) : downloadingId === ep.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDownload(ep)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
