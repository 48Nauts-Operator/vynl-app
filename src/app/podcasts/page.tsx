"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Podcast, RefreshCw, Loader2, Rss } from "lucide-react";

interface PodcastItem {
  id: number;
  title: string;
  author: string | null;
  coverPath: string | null;
  episodeCount: number;
  lastFetchedAt: string | null;
}

export default function PodcastsPage() {
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPodcasts = useCallback(async () => {
    try {
      const res = await fetch("/api/podcasts");
      const data = await res.json();
      setPodcasts(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPodcasts();
  }, [fetchPodcasts]);

  const handleSubscribe = async () => {
    if (!feedUrl.trim()) return;
    setSubscribing(true);
    try {
      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: feedUrl.trim() }),
      });
      if (res.ok) {
        setFeedUrl("");
        setDialogOpen(false);
        fetchPodcasts();
      }
    } finally {
      setSubscribing(false);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    for (const p of podcasts) {
      try {
        await fetch(`/api/podcasts/${p.id}/refresh`, { method: "POST" });
      } catch {
        // continue
      }
    }
    await fetchPodcasts();
    setRefreshing(false);
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Podcasts</h1>
          <p className="text-muted-foreground mt-1">
            {podcasts.length} subscription{podcasts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podcasts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh All
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Subscribe
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Subscribe to Podcast</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2">
                  <Rss className="h-5 w-5 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Paste RSS feed URL..."
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
                  />
                </div>
                <Button
                  onClick={handleSubscribe}
                  disabled={subscribing || !feedUrl.trim()}
                  className="w-full"
                >
                  {subscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  {subscribing ? "Subscribing..." : "Subscribe"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : podcasts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <Podcast className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold">No podcasts yet</h2>
            <p className="text-muted-foreground mt-2 max-w-sm">
              Subscribe to your favorite podcasts by pasting their RSS feed URL.
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
        >
          {podcasts.map((podcast) => (
            <motion.div key={podcast.id} variants={item}>
              <Link href={`/podcasts/${podcast.id}`}>
                <Card className="overflow-hidden hover:ring-1 hover:ring-primary/50 transition-all group cursor-pointer">
                  <div className="aspect-square relative bg-muted">
                    {podcast.coverPath ? (
                      <Image
                        src={podcast.coverPath}
                        alt={podcast.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Podcast className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <p className="font-medium text-sm truncate">{podcast.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {podcast.author || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {podcast.episodeCount} episode{podcast.episodeCount !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
