"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlayerStore, Track } from "@/store/player";
import {
  Music,
  Clock,
  Play,
  ListMusic,
  Speaker,
  User,
  Compass,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { formatDuration } from "@/lib/utils";

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

export default function HomePage() {
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const [profileExists, setProfileExists] = useState(false);

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
  }, []);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={item}>
        <h1 className="text-3xl font-bold">Welcome to Tunify</h1>
        <p className="text-muted-foreground mt-1">
          Your AI-powered music companion
        </p>
      </motion.div>

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
      </motion.div>

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
