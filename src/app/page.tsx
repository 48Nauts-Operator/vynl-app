"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlayerStore, Track } from "@/store/player";
import {
  Music,
  Clock,
  Play,
  ListMusic,
  Speaker,
  Compass,
  Disc3,
  TrendingUp,
  Headphones,
  PartyPopper,
  FolderInput,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

interface HistoryEntry {
  id: number;
  trackTitle: string;
  trackArtist: string;
  playedAt: string;
  source: string;
}

interface PlaylistInfo {
  id: number;
  name: string;
  coverPath?: string;
  trackCount: number;
}

interface TopTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  coverPath: string | null;
  playCount: number;
  lastPlayed: string;
}

interface TopAlbum {
  album: string;
  albumArtist: string;
  coverPath: string | null;
  totalPlays: number;
  trackCount: number;
}

interface StatsData {
  topTracks: TopTrack[];
  topAlbums: TopAlbum[];
  totalTracksPlayed: number;
  totalListeningHours: number;
}

interface HeavyRotation {
  id: number;
  name: string;
  trackCount: number;
  tracks: Track[];
}

interface ImportJob {
  status: "idle" | "running" | "complete" | "error";
  total?: number;
  current?: number;
  currentFolder?: string;
  succeeded?: number;
  failed?: number;
  postProcessing?: boolean;
  error?: string;
}

export default function HomePage() {
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const [profileExists, setProfileExists] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [heavyRotation, setHeavyRotation] = useState<HeavyRotation | null>(null);
  const [importJob, setImportJob] = useState<ImportJob>({ status: "idle" });
  const { setQueue } = usePlayerStore();

  useEffect(() => {
    fetch("/api/library/history?limit=10")
      .then((r) => r.json())
      .then((d) => setRecentHistory(d.history || []))
      .catch(() => {});

    fetch("/api/playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists || []))
      .catch(() => {});

    fetch("/api/library?limit=1")
      .then((r) => r.json())
      .then((d) => setTrackCount(d.total || 0))
      .catch(() => {});

    fetch("/api/ai/profile")
      .then((r) => r.json())
      .then((d) => setProfileExists(!!d.profile))
      .catch(() => {});

    fetch("/api/library/stats?period=4weeks")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});

    // Trigger Heavy Rotation auto-generation
    fetch("/api/playlists/auto-generate", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.playlist && d.playlist.trackCount > 0) {
          setHeavyRotation(d.playlist);
        }
      })
      .catch(() => {});
  }, []);

  // Poll for background import job
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/library/import/batch");
        const data = await res.json();
        if (active) setImportJob(data);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  const hasStats = stats && stats.topTracks.length >= 3;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome to Vynl</h1>
          <p className="text-muted-foreground mt-1">
            Your AI-powered music companion
          </p>
        </div>
        <Link href="/party">
          <Button variant="outline" size="lg" className="gap-2">
            <PartyPopper className="h-5 w-5" />
            Party Mode
          </Button>
        </Link>
      </motion.div>

      {/* Background Jobs */}
      {importJob.status !== "idle" && (
        <motion.div variants={item}>
          <Card className={importJob.status === "running" ? "border-primary/40" : ""}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                {importJob.status === "running" ? (
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  </div>
                ) : importJob.status === "complete" ? (
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {importJob.status === "running"
                        ? "Batch Import Running"
                        : importJob.status === "complete"
                        ? "Batch Import Complete"
                        : "Batch Import Failed"}
                    </p>
                    {importJob.status === "running" && importJob.total && (
                      <span className="text-xs text-muted-foreground">
                        {importJob.current}/{importJob.total} folders
                      </span>
                    )}
                  </div>
                  {importJob.status === "running" && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {importJob.postProcessing
                        ? "Scanning library & extracting covers..."
                        : importJob.currentFolder}
                    </p>
                  )}
                  {importJob.status === "complete" && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-green-400">{importJob.succeeded} succeeded</span>
                      {(importJob.failed ?? 0) > 0 && (
                        <span className="text-red-400 ml-2">{importJob.failed} failed</span>
                      )}
                      <span className="ml-2">of {importJob.total} folders</span>
                    </p>
                  )}
                </div>
              </div>
              {importJob.status === "running" && importJob.total && (
                <Progress
                  value={Math.round(((importJob.current || 0) / importJob.total) * 100)}
                  className="h-2"
                />
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick Stats */}
      <motion.div
        variants={item}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <Link href="/library">
          <Card className="hover:bg-secondary/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <Music className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{trackCount}</p>
                <p className="text-sm text-muted-foreground">Tracks</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/playlists">
          <Card className="hover:bg-secondary/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <ListMusic className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{playlists.length}</p>
                <p className="text-sm text-muted-foreground">Playlists</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/discover">
          <Card className="hover:bg-secondary/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <Compass className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">Discover</p>
                <p className="text-sm text-muted-foreground">
                  {profileExists ? "Profile active" : "Start session"}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {hasStats ? (
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <Headphones className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalListeningHours}h</p>
                <p className="text-sm text-muted-foreground">Listened (4w)</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Link href="/speakers">
            <Card className="hover:bg-secondary/50 transition-colors cursor-pointer">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Speaker className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">Speakers</p>
                  <p className="text-sm text-muted-foreground">Manage output</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </motion.div>

      {/* Heavy Rotation */}
      {heavyRotation && heavyRotation.tracks.length > 0 && (
        <motion.div variants={item}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Heavy Rotation</h2>
            <Badge variant="secondary" className="text-xs">Auto-updated</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {heavyRotation.tracks.slice(0, 5).map((track, i) => (
              <Card
                key={track.id}
                className="hover:bg-secondary/50 transition-colors cursor-pointer group"
                onClick={() => setQueue(heavyRotation.tracks, i)}
              >
                <CardContent className="p-4">
                  <div className="aspect-square rounded-lg bg-secondary mb-3 flex items-center justify-center overflow-hidden relative">
                    {track.coverPath ? (
                      <Image
                        src={track.coverPath}
                        alt={track.title}
                        fill
                        sizes="200px"
                        className="object-cover"
                      />
                    ) : (
                      <Music className="h-10 w-10 text-muted-foreground" />
                    )}
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" className="rounded-full h-10 w-10 shadow-lg">
                        <Play className="h-4 w-4 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="font-medium truncate text-sm">{track.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Most Played Songs */}
      {hasStats && (
        <motion.div variants={item}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Most Played Songs</h2>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4" style={{ minWidth: "max-content" }}>
              {stats.topTracks.map((track) => (
                <Card
                  key={track.id || track.title}
                  className="w-44 shrink-0 hover:bg-secondary/50 transition-colors cursor-pointer group"
                >
                  <CardContent className="p-3">
                    <div className="aspect-square rounded-lg bg-secondary mb-2 flex items-center justify-center overflow-hidden relative">
                      {track.coverPath ? (
                        <Image
                          src={track.coverPath}
                          alt={track.title}
                          fill
                          sizes="176px"
                          className="object-cover"
                        />
                      ) : (
                        <Music className="h-8 w-8 text-muted-foreground" />
                      )}
                      <div className="absolute top-1.5 right-1.5">
                        <Badge className="text-xs">{track.playCount}x</Badge>
                      </div>
                    </div>
                    <p className="font-medium truncate text-sm">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Top Albums */}
      {hasStats && stats.topAlbums.length > 0 && (
        <motion.div variants={item}>
          <div className="flex items-center gap-2 mb-4">
            <Disc3 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Top Albums</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {stats.topAlbums.slice(0, 5).map((album) => (
              <Link
                key={`${album.albumArtist}-${album.album}`}
                href={`/albums/${encodeURIComponent(`${album.albumArtist}---${album.album}`)}`}
              >
                <Card className="hover:bg-secondary/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="aspect-square rounded-lg bg-secondary mb-3 flex items-center justify-center overflow-hidden relative">
                      {album.coverPath ? (
                        <Image
                          src={album.coverPath}
                          alt={album.album}
                          fill
                          sizes="200px"
                          className="object-cover"
                        />
                      ) : (
                        <Disc3 className="h-10 w-10 text-muted-foreground" />
                      )}
                      <div className="absolute top-1.5 right-1.5">
                        <Badge className="text-xs">{album.totalPlays} plays</Badge>
                      </div>
                    </div>
                    <p className="font-medium truncate text-sm">{album.album}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {album.albumArtist}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick Playlists */}
      {playlists.length > 0 && (
        <motion.div variants={item}>
          <h2 className="text-xl font-semibold mb-4">Your Playlists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {playlists.slice(0, 5).map((pl) => (
              <Link key={pl.id} href={`/playlists?id=${pl.id}`}>
                <Card className="hover:bg-secondary/50 transition-colors cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="aspect-square rounded-lg bg-secondary mb-3 flex items-center justify-center overflow-hidden relative">
                      {pl.coverPath ? (
                        <Image
                          src={pl.coverPath}
                          alt={pl.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <ListMusic className="h-10 w-10 text-muted-foreground" />
                      )}
                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          className="rounded-full h-10 w-10 shadow-lg"
                        >
                          <Play className="h-4 w-4 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="font-medium truncate">{pl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pl.trackCount} tracks
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recently Played */}
      <motion.div variants={item}>
        <h2 className="text-xl font-semibold mb-4">Recently Played</h2>
        {recentHistory.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              {recentHistory.map((entry, i) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-sm text-muted-foreground w-6 text-right">
                    {i + 1}
                  </span>
                  <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
                    <Music className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {entry.trackTitle}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.trackArtist}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {entry.source}
                    </Badge>
                    <Clock className="h-3 w-3" />
                    {new Date(entry.playedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No listening history yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start playing music to build your history
              </p>
              <Link href="/library" className="mt-4">
                <Button>Browse Library</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </motion.div>
  );
}
