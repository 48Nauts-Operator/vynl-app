"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VinylRating } from "@/components/ui/VinylRating";
import {
  Disc3,
  Loader2,
  BarChart3,
  Music,
  Trophy,
  TrendingUp,
  ThumbsDown,
  Archive,
  Headphones,
  Hash,
} from "lucide-react";

interface RatedTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  coverPath: string | null;
  playCount: number;
  rating: number;
}

interface PlayedTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  coverPath: string | null;
  playCount: number;
}

interface RatedAlbum {
  album: string;
  albumArtist: string;
  coverPath: string | null;
  avgRating: number;
  ratedTracks: number;
  totalPlays: number;
}

interface PlayedAlbum {
  album: string;
  albumArtist: string;
  coverPath: string | null;
  totalPlays: number;
  trackCount: number;
}

interface StatsData {
  bestRatedAlbums: RatedAlbum[];
  bestRatedTracks: RatedTrack[];
  mostPlayedTracks: PlayedTrack[];
  mostPlayedAlbums: PlayedAlbum[];
  worstTracks: RatedTrack[];
  summary: {
    totalTracks: number;
    libraryHours: number;
    totalRated: number;
    avgRating: number;
    totalPlays: number;
    listeningHours: number;
  };
}

function CoverThumb({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center overflow-hidden shrink-0">
      {src ? (
        <Image src={src} alt={alt} width={40} height={40} className="object-cover w-full h-full" />
      ) : (
        <Disc3 className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const handleArchive = async (trackId: number) => {
    setArchiving((prev) => new Set(prev).add(trackId));
    try {
      await fetch("/api/library/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: [trackId] }),
      });
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, worstTracks: prev.worstTracks.filter((t) => t.id !== trackId) };
      });
    } catch {}
    setArchiving((prev) => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg text-muted-foreground">Could not load stats</p>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="h-8 w-8" />
          Stats
        </h1>
        <p className="text-muted-foreground mt-1">Your listening habits &amp; ratings at a glance</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="best-albums">Best Albums</TabsTrigger>
          <TabsTrigger value="best-tracks">Best Tracks</TabsTrigger>
          <TabsTrigger value="most-played">Most Played</TabsTrigger>
          <TabsTrigger value="worst">Worst Tracks</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SummaryCard icon={Music} label="Total Tracks" value={summary.totalTracks.toLocaleString()} />
            <SummaryCard
              icon={Disc3}
              label="Library Duration"
              value={summary.libraryHours ? `${summary.libraryHours}h` : "0h"}
              sub={summary.libraryHours ? `${Math.round(summary.libraryHours / 24)} days` : undefined}
            />
            <SummaryCard icon={Disc3} label="Tracks Rated" value={String(summary.totalRated)} />
            <SummaryCard
              icon={Trophy}
              label="Average Rating"
              value={summary.avgRating ? `${summary.avgRating} / 5` : "—"}
            />
            <SummaryCard icon={TrendingUp} label="Total Plays" value={summary.totalPlays.toLocaleString()} />
            <SummaryCard
              icon={Headphones}
              label="Hours Listened"
              value={summary.listeningHours ? `${summary.listeningHours}h` : "0h"}
            />
          </div>

          {/* Top 5 preview sections */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" /> Top Rated Tracks
                </h3>
                {data.bestRatedTracks.slice(0, 5).map((track, i) => (
                  <div key={track.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                    <CoverThumb src={track.coverPath} alt={track.title} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    <VinylRating rating={track.rating} size="sm" readOnly />
                  </div>
                ))}
                {data.bestRatedTracks.length === 0 && (
                  <p className="text-sm text-muted-foreground">No rated tracks yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Most Played Tracks
                </h3>
                {data.mostPlayedTracks.slice(0, 5).map((track, i) => (
                  <div key={track.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                    <CoverThumb src={track.coverPath} alt={track.title} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{track.playCount} plays</span>
                  </div>
                ))}
                {data.mostPlayedTracks.length === 0 && (
                  <p className="text-sm text-muted-foreground">No play history yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" /> Top Rated Albums
                </h3>
                {data.bestRatedAlbums.slice(0, 5).map((album, i) => (
                  <div key={`${album.album}-${album.albumArtist}`} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                    <CoverThumb src={album.coverPath} alt={album.album} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{album.album}</p>
                      <p className="text-xs text-muted-foreground truncate">{album.albumArtist}</p>
                    </div>
                    <VinylRating rating={Math.round(album.avgRating)} size="sm" readOnly />
                  </div>
                ))}
                {data.bestRatedAlbums.length === 0 && (
                  <p className="text-sm text-muted-foreground">Rate 3+ tracks per album to see rankings</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Most Played Albums
                </h3>
                {data.mostPlayedAlbums.slice(0, 5).map((album, i) => (
                  <div key={`${album.album}-${album.albumArtist}`} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                    <CoverThumb src={album.coverPath} alt={album.album} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{album.album}</p>
                      <p className="text-xs text-muted-foreground truncate">{album.albumArtist}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{album.totalPlays} plays</span>
                  </div>
                ))}
                {data.mostPlayedAlbums.length === 0 && (
                  <p className="text-sm text-muted-foreground">No play history yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Best Albums ── */}
        <TabsContent value="best-albums">
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-[40px_48px_1fr_130px_80px] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <span><Hash className="h-3 w-3 inline" /></span>
                <span></span>
                <span>Album</span>
                <span>Rating</span>
                <span className="text-right">Plays</span>
              </div>
              {data.bestRatedAlbums.map((album, i) => (
                <div
                  key={`${album.album}-${album.albumArtist}`}
                  className="grid grid-cols-[40px_48px_1fr_130px_80px] gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors items-center"
                >
                  <span className="text-sm text-muted-foreground">{i + 1}</span>
                  <CoverThumb src={album.coverPath} alt={album.album} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{album.album}</p>
                    <p className="text-xs text-muted-foreground truncate">{album.albumArtist}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <VinylRating rating={Math.round(album.avgRating)} size="sm" readOnly />
                    <span className="text-xs text-muted-foreground">({album.avgRating})</span>
                  </div>
                  <span className="text-sm text-muted-foreground text-right">{album.totalPlays}</span>
                </div>
              ))}
              {data.bestRatedAlbums.length === 0 && (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  Rate 3+ tracks in an album to see it ranked here
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Best Tracks ── */}
        <TabsContent value="best-tracks">
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-[40px_48px_1fr_130px_80px] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <span><Hash className="h-3 w-3 inline" /></span>
                <span></span>
                <span>Track</span>
                <span>Rating</span>
                <span className="text-right">Plays</span>
              </div>
              {data.bestRatedTracks.map((track, i) => (
                <div
                  key={track.id}
                  className="grid grid-cols-[40px_48px_1fr_130px_80px] gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors items-center"
                >
                  <span className="text-sm text-muted-foreground">{i + 1}</span>
                  <CoverThumb src={track.coverPath} alt={track.title} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist} — {track.album}
                    </p>
                  </div>
                  <VinylRating rating={track.rating} size="sm" readOnly />
                  <span className="text-sm text-muted-foreground text-right">{track.playCount}</span>
                </div>
              ))}
              {data.bestRatedTracks.length === 0 && (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  No rated tracks yet — start rating from album pages
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Most Played ── */}
        <TabsContent value="most-played" className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold flex items-center gap-2">
                  <Music className="h-4 w-4" /> Most Played Tracks
                </h3>
              </div>
              {data.mostPlayedTracks.map((track, i) => (
                <div
                  key={track.id}
                  className="grid grid-cols-[40px_48px_1fr_80px] gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors items-center"
                >
                  <span className="text-sm text-muted-foreground">{i + 1}</span>
                  <CoverThumb src={track.coverPath} alt={track.title} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist} — {track.album}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground text-right">{track.playCount} plays</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold flex items-center gap-2">
                  <Disc3 className="h-4 w-4" /> Most Played Albums
                </h3>
              </div>
              {data.mostPlayedAlbums.map((album, i) => (
                <div
                  key={`${album.album}-${album.albumArtist}`}
                  className="grid grid-cols-[40px_48px_1fr_80px] gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors items-center"
                >
                  <span className="text-sm text-muted-foreground">{i + 1}</span>
                  <CoverThumb src={album.coverPath} alt={album.album} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{album.album}</p>
                    <p className="text-xs text-muted-foreground truncate">{album.albumArtist}</p>
                  </div>
                  <span className="text-sm text-muted-foreground text-right">{album.totalPlays} plays</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Worst Tracks ── */}
        <TabsContent value="worst">
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-[40px_48px_1fr_130px_100px] gap-3 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                <span><Hash className="h-3 w-3 inline" /></span>
                <span></span>
                <span>Track</span>
                <span>Rating</span>
                <span className="text-right">Action</span>
              </div>
              {data.worstTracks.map((track, i) => (
                <div
                  key={track.id}
                  className="grid grid-cols-[40px_48px_1fr_130px_100px] gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors items-center"
                >
                  <span className="text-sm text-muted-foreground">{i + 1}</span>
                  <CoverThumb src={track.coverPath} alt={track.title} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist} — {track.album}
                    </p>
                  </div>
                  <VinylRating rating={track.rating} size="sm" readOnly />
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleArchive(track.id)}
                      disabled={archiving.has(track.id)}
                    >
                      <Archive className="h-3 w-3 mr-1" />
                      {archiving.has(track.id) ? "..." : "Archive"}
                    </Button>
                  </div>
                </div>
              ))}
              {data.worstTracks.length === 0 && (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <ThumbsDown className="h-10 w-10 mb-3" />
                  <p className="text-sm">No low-rated tracks — everything&apos;s golden!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
