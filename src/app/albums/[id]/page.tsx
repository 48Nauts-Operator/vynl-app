"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlayerStore, Track as PlayerTrack } from "@/store/player";
import { Play, Shuffle, Disc3, Loader2, Clock, ImageIcon, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { formatDuration } from "@/lib/utils";
import { CoverSearchDialog } from "@/components/albums/CoverSearchDialog";

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
  const [showCoverSearch, setShowCoverSearch] = useState(false);
  const { setQueue } = usePlayerStore();

  // Track context menu
  const [trackMenu, setTrackMenu] = useState<{ x: number; y: number; track: AlbumTrack; index: number } | null>(null);

  // Track rename
  const [renaming, setRenaming] = useState<AlbumTrack | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameArtist, setRenameArtist] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

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

  // Close track context menu on click elsewhere
  useEffect(() => {
    if (!trackMenu) return;
    const close = () => setTrackMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [trackMenu]);

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

  const startRenameTrack = (track: AlbumTrack) => {
    setRenaming(track);
    setRenameTitle(track.title);
    setRenameArtist(track.artist);
  };

  const handleRenameTrack = async () => {
    if (!renaming || !renameTitle.trim()) return;
    setRenameLoading(true);
    try {
      await fetch("/api/tracks/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: renaming.id,
          title: renameTitle.trim(),
          artist: renameArtist.trim(),
        }),
      });
      // Update local state
      setAlbum((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === renaming.id
              ? { ...t, title: renameTitle.trim(), artist: renameArtist.trim() }
              : t
          ),
        };
      });
    } catch {}
    setRenameLoading(false);
    setRenaming(null);
  };

  // Group by disc if multiple discs
  const hasMultipleDiscs = new Set(album.tracks.map((t) => t.discNumber)).size > 1;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex gap-6 items-end">
        <div className="relative w-56 h-56 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shrink-0 shadow-2xl group">
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
          <button
            className="absolute bottom-2 left-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
            onClick={() => setShowCoverSearch(true)}
            title="Find Cover Art"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTrackMenu({ x: e.clientX, y: e.clientY, track, index: i });
                  }}
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

      {/* Track context menu */}
      {trackMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: trackMenu.x, top: trackMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              playTrack(trackMenu.index);
              setTrackMenu(null);
            }}
          >
            <Play className="h-4 w-4" />
            Play
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              startRenameTrack(trackMenu.track);
              setTrackMenu(null);
            }}
          >
            <Pencil className="h-4 w-4" />
            Rename Track
          </button>
        </div>
      )}

      {/* Rename track dialog */}
      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Track</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRenameTrack()}
              />
            </div>
            <div className="space-y-2">
              <Label>Artist</Label>
              <Input
                value={renameArtist}
                onChange={(e) => setRenameArtist(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRenameTrack()}
              />
            </div>
            <Button
              onClick={handleRenameTrack}
              disabled={renameLoading || !renameTitle.trim()}
            >
              {renameLoading ? "Renaming..." : "Rename"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cover search dialog */}
      <CoverSearchDialog
        open={showCoverSearch}
        onOpenChange={setShowCoverSearch}
        album={album.album}
        albumArtist={album.albumArtist}
        onCoverUpdated={(coverPath) => {
          setAlbum((prev) => prev ? { ...prev, coverPath } : prev);
          setShowCoverSearch(false);
        }}
      />
    </div>
  );
}
