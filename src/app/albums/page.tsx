"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlayerStore } from "@/store/player";
import { Disc3, Play, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { formatDuration } from "@/lib/utils";

interface Album {
  album: string;
  album_artist: string;
  year: number | null;
  cover_path: string | null;
  genre: string | null;
  track_count: number;
  total_duration: number;
  first_track_id: number;
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [sort, setSort] = useState("artist");
  const [genre, setGenre] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { setQueue } = usePlayerStore();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ sort });
      if (genre) params.set("genre", genre);
      const res = await fetch(`/api/albums?${params}`);
      const data = await res.json();
      setAlbums(data.albums || []);
      setGenres(data.genres || []);
      setLoading(false);
    }
    load();
  }, [sort, genre]);

  const playAlbum = async (album: Album) => {
    const id = encodeURIComponent(`${album.album_artist}---${album.album}`);
    const res = await fetch(`/api/albums/${id}`);
    const data = await res.json();
    if (data.tracks) {
      const playerTracks = data.tracks.map((t: any) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        filePath: t.filePath,
        coverPath: t.coverPath || undefined,
        source: "local" as const,
      }));
      setQueue(playerTracks, 0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Albums</h1>
          <p className="text-muted-foreground mt-1">{albums.length} albums</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={genre || "all"} onValueChange={(v) => setGenre(v === "all" ? null : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All genres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genres</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="artist">By Artist</SelectItem>
              <SelectItem value="name">By Name</SelectItem>
              <SelectItem value="year">By Year</SelectItem>
              <SelectItem value="recent">Recently Added</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {albums.map((album, i) => (
            <motion.div
              key={`${album.album_artist}-${album.album}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
            >
              <Link
                href={`/albums/${encodeURIComponent(`${album.album_artist}---${album.album}`)}`}
              >
                <Card className="hover:bg-secondary/50 transition-colors cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="aspect-square rounded-lg bg-secondary mb-3 flex items-center justify-center overflow-hidden relative">
                      {album.cover_path ? (
                        <Image
                          src={album.cover_path}
                          alt={album.album}
                          fill
                          sizes="256px"
                          className="object-cover"
                        />
                      ) : (
                        <Disc3 className="h-10 w-10 text-muted-foreground" />
                      )}
                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          className="rounded-full h-10 w-10 shadow-lg"
                          onClick={(e) => {
                            e.preventDefault();
                            playAlbum(album);
                          }}
                        >
                          <Play className="h-4 w-4 ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="font-medium truncate text-sm">{album.album}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {album.album_artist}
                      {album.year ? ` · ${album.year}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {album.track_count} tracks
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && albums.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Disc3 className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">No albums found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Scan your music library to get started
          </p>
        </div>
      )}
    </div>
  );
}
