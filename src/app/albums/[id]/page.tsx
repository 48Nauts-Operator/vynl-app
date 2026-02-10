"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlayerStore, Track as PlayerTrack } from "@/store/player";
import { Play, Shuffle, ListPlus, Disc3, Loader2, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { formatDuration } from "@/lib/utils";

interface AlbumTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: number;
  trackNumber: number;
  discNumber: number;
  duration: number;
  filePath: string;
  fileSize: number;
  format: string;
  bitrate: number;
  sampleRate: number;
  coverPath: string | null;
  source: string;
  playCount: number;
}

interface AlbumDetail {
  album: string;
  albumArtist: string;
  year: number | null;
  genre: string | null;
  coverPath: string | null;
  trackCount: number;
  totalDuration: number;
  tracks: AlbumTrack[];
}

function toPlayerTrack(t: AlbumTrack): PlayerTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    filePath: t.filePath,
    coverPath: t.coverPath || undefined,
    source: "local",
  };
}

export default function AlbumDetailPage() {
  const params = useParams();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { setQueue } = usePlayerStore();

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/albums/${params.id}`);
      if (res.ok) {
        setAlbum(await res.json());
      }
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Disc3 className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg text-muted-foreground">Album not found</p>
      </div>
    );
  }

  const playAll = () => {
    setQueue(album.tracks.map(toPlayerTrack), 0);
  };

  const shufflePlay = () => {
    const shuffled = [...album.tracks].sort(() => Math.random() - 0.5);
    setQueue(shuffled.map(toPlayerTrack), 0);
  };

  const playTrack = (index: number) => {
    setQueue(album.tracks.map(toPlayerTrack), index);
  };

  // Group by disc if multiple discs
  const hasMultipleDiscs = new Set(album.tracks.map((t) => t.discNumber)).size > 1;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex gap-6 items-end">
        <div className="w-56 h-56 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0 shadow-2xl">
          {album.coverPath ? (
            <Image
              src={album.coverPath}
              alt={album.album}
              width={224}
              height={224}
              className="object-cover w-full h-full"
            />
          ) : (
            <Disc3 className="h-16 w-16 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-wider text-muted-foreground">
            Album
          </p>
          <h1 className="text-4xl font-bold">{album.album}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {album.albumArtist}
            </span>
            {album.year && (
              <>
                <span>·</span>
                <span>{album.year}</span>
              </>
            )}
            <span>·</span>
            <span>{album.trackCount} tracks</span>
            <span>·</span>
            <span>{formatDuration(album.totalDuration)}</span>
            {album.genre && (
              <>
                <span>·</span>
                <Badge variant="secondary">{album.genre}</Badge>
              </>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={playAll}>
              <Play className="h-4 w-4 mr-2" /> Play All
            </Button>
            <Button variant="outline" onClick={shufflePlay}>
              <Shuffle className="h-4 w-4 mr-2" /> Shuffle
            </Button>
          </div>
        </div>
      </div>

      {/* Tracklist */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[40px_1fr_80px] gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
            <span>#</span>
            <span>Title</span>
            <span className="text-right">
              <Clock className="h-3 w-3 inline" />
            </span>
          </div>
          {album.tracks.map((track, i) => {
            const prevTrack = album.tracks[i - 1];
            const showDiscHeader =
              hasMultipleDiscs &&
              (!prevTrack || prevTrack.discNumber !== track.discNumber);

            return (
              <React.Fragment key={track.id}>
                {showDiscHeader && (
                  <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-secondary/30 border-b border-border">
                    Disc {track.discNumber}
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="grid grid-cols-[40px_1fr_80px] gap-4 px-4 py-2 hover:bg-secondary/30 transition-colors cursor-pointer group items-center"
                  onClick={() => playTrack(i)}
                >
                  <span className="text-sm text-muted-foreground group-hover:hidden">
                    {track.trackNumber || i + 1}
                  </span>
                  <Play className="h-4 w-4 hidden group-hover:block text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{track.title}</p>
                    {track.artist !== album.albumArtist && (
                      <p className="text-xs text-muted-foreground truncate">
                        {track.artist}
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground text-right">
                    {formatDuration(track.duration)}
                  </span>
                </motion.div>
              </React.Fragment>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
