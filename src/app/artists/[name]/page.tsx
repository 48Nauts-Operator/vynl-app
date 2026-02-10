"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player";
import { Play, Disc3, Mic2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
// formatDuration available from "@/lib/utils" if needed

interface Album {
  album: string;
  album_artist: string;
  year: number | null;
  cover_path: string | null;
  track_count: number;
  total_duration: number;
}

export default function ArtistDetailPage() {
  const params = useParams();
  const artistName = decodeURIComponent(params.name as string);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const { setQueue } = usePlayerStore();

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/albums?sort=year`);
      const data = await res.json();
      const allAlbums = data.albums || [];
      setAlbums(
        allAlbums.filter(
          (a: Album) =>
            a.album_artist.toLowerCase() === artistName.toLowerCase()
        )
      );
      setLoading(false);
    }
    load();
  }, [artistName]);

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

  const totalTracks = albums.reduce((sum, a) => sum + a.track_count, 0);
  const coverPath = albums.find((a) => a.cover_path)?.cover_path;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Artist header */}
      <div className="flex gap-6 items-end">
        <div className="w-40 h-40 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0 shadow-2xl">
          {coverPath ? (
            <Image
              src={coverPath}
              alt={artistName}
              width={160}
              height={160}
              className="object-cover rounded-full"
            />
          ) : (
            <Mic2 className="h-14 w-14 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm uppercase tracking-wider text-muted-foreground">
            Artist
          </p>
          <h1 className="text-4xl font-bold">{artistName}</h1>
          <p className="text-muted-foreground mt-1">
            {albums.length} album{albums.length !== 1 ? "s" : ""} · {totalTracks}{" "}
            track{totalTracks !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Albums */}
      <h2 className="text-xl font-semibold">Albums</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {albums.map((album, i) => (
          <motion.div
            key={album.album}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
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
                  <p className="text-xs text-muted-foreground">
                    {album.year || "Unknown Year"} · {album.track_count} tracks
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {albums.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Disc3 className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">No albums found for this artist</p>
        </div>
      )}
    </div>
  );
}
