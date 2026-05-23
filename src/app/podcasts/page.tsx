"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { Plus, Podcast, RefreshCw, Loader2, Rss, Search, Check } from "lucide-react";
import type { PodcastSearchResult } from "@/app/api/podcasts/search/route";

interface PodcastItem {
  id: number;
  title: string;
  author: string | null;
  coverPath: string | null;
  episodeCount: number;
  lastFetchedAt: string | null;
}

const AUTO_DL_OPTIONS = [0, 1, 3, 5, 10] as const;

type Banner =
  | { kind: "ok"; text: string }
  | { kind: "err"; text: string }
  | null;

export default function PodcastsPage() {
  const [podcasts, setPodcasts] = useState<PodcastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Search state
  const [query, setQuery] = useState("");
  const [autoDL, setAutoDL] = useState<number>(3);
  const [searchResults, setSearchResults] = useState<PodcastSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingSubscribeFeed, setPendingSubscribeFeed] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Auto-dismiss banner after 5s.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  // Debounced search: fire when query has ≥2 chars and stays idle for 400ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearchError(null);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/podcasts/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) {
          setSearchError(data?.error || "Search failed");
          setSearchResults([]);
        } else {
          setSearchResults(data.results || []);
        }
      } catch (err) {
        setSearchError(String(err));
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSubscribeFromSearch = async (result: PodcastSearchResult) => {
    setPendingSubscribeFeed(result.feedUrl);
    try {
      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: result.feedUrl, autoDownloadLatest: autoDL }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data?.error || "Subscribe failed" });
        return;
      }
      const dl = data.autoDownloadStarted || 0;
      const skipped = data.episodesSkipped || 0;
      const skipText = skipped > 0 ? `, ${skipped} skipped` : "";
      const dlText = dl > 0 ? `, ${dl} downloading` : "";
      setBanner({
        kind: "ok",
        text: `Subscribed to ${result.title} — ${data.episodesImported} episodes imported${skipText}${dlText}`,
      });
      // Mark this card as subscribed without re-querying iTunes.
      setSearchResults((prev) =>
        prev ? prev.map((r) => (r.feedUrl === result.feedUrl ? { ...r, alreadySubscribed: true } : r)) : prev
      );
      fetchPodcasts();
    } catch (err) {
      setBanner({ kind: "err", text: String(err) });
    } finally {
      setPendingSubscribeFeed(null);
    }
  };

  const handleSubscribeFromDialog = async () => {
    if (!feedUrl.trim()) return;
    setSubscribing(true);
    try {
      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: feedUrl.trim(), autoDownloadLatest: autoDL }),
      });
      const data = await res.json();
      if (res.ok) {
        const dl = data.autoDownloadStarted || 0;
        const skipped = data.episodesSkipped || 0;
        const skipText = skipped > 0 ? `, ${skipped} skipped` : "";
        const dlText = dl > 0 ? `, ${dl} downloading` : "";
        setBanner({
          kind: "ok",
          text: `Subscribed — ${data.episodesImported} episodes imported${skipText}${dlText}`,
        });
        setFeedUrl("");
        setDialogOpen(false);
        fetchPodcasts();
      } else {
        setBanner({ kind: "err", text: data?.error || "Subscribe failed" });
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
        </div>
      </div>

      {/* Search bar — primary discovery surface */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <Input
              placeholder="Search podcasts (e.g. Lex Fridman, Huberman, Daily…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
              <span>Auto-DL</span>
              <select
                value={autoDL}
                onChange={(e) => setAutoDL(parseInt(e.target.value, 10))}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {AUTO_DL_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Off" : `Latest ${n}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Banner — inline status feedback (auto-dismisses after 5s) */}
          {banner && (
            <div
              className={`text-sm rounded-md px-3 py-2 ${
                banner.kind === "ok"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {banner.text}
            </div>
          )}

          {/* Search results / states */}
          {searching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching iTunes…
            </div>
          )}
          {searchError && !searching && (
            <div className="text-sm text-red-500">iTunes search failed: {searchError}</div>
          )}
          {!searching && searchResults && searchResults.length === 0 && !searchError && query.trim().length >= 2 && (
            <div className="text-sm text-muted-foreground">
              No matches for &ldquo;{query}&rdquo; — try a different term or{" "}
              <button
                onClick={() => setDialogOpen(true)}
                className="underline hover:text-foreground"
              >
                paste an RSS URL
              </button>
              .
            </div>
          )}
          {!searching && searchResults && searchResults.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
              {searchResults.map((r) => (
                <div
                  key={r.feedUrl}
                  className="snap-start shrink-0 w-44 rounded-lg border border-border bg-card overflow-hidden flex flex-col"
                >
                  <div className="aspect-square relative bg-muted">
                    {r.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.coverUrl} alt={r.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Podcast className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col gap-1.5">
                    <p className="font-medium text-sm leading-tight line-clamp-2">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.author || "Unknown"}</p>
                    {typeof r.episodeCount === "number" && (
                      <p className="text-[11px] text-muted-foreground/60">
                        {r.episodeCount} episode{r.episodeCount !== 1 ? "s" : ""}
                      </p>
                    )}
                    <div className="mt-auto pt-1.5">
                      {r.alreadySubscribed ? (
                        <Button size="sm" variant="outline" className="w-full" disabled>
                          <Check className="h-3.5 w-3.5 mr-1.5" /> Subscribed
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => handleSubscribeFromSearch(r)}
                          disabled={pendingSubscribeFeed === r.feedUrl}
                        >
                          {pendingSubscribeFeed === r.feedUrl ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Subscribe
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Escape hatch: manual RSS URL */}
          <div className="text-xs text-muted-foreground">
            Have a private feed?{" "}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button className="underline hover:text-foreground">Add by RSS URL</button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add by RSS URL</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2">
                    <Rss className="h-5 w-5 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="https://example.com/podcast.xml"
                      value={feedUrl}
                      onChange={(e) => setFeedUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSubscribeFromDialog()}
                    />
                  </div>
                  <Button
                    onClick={handleSubscribeFromDialog}
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
        </CardContent>
      </Card>

      {/* Subscribed grid */}
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
              Search above to find and subscribe to your favourite shows.
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
