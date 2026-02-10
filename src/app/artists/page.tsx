"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mic2, Search, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface Artist {
  name: string;
  albumCount: number;
  trackCount: number;
  coverPath: string | null;
}

export default function ArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/albums");
      const data = await res.json();
      const albums = data.albums || [];

      // Group albums by artist
      const artistMap = new Map<
        string,
        { albumCount: number; trackCount: number; coverPath: string | null }
      >();
      for (const a of albums) {
        const name = a.album_artist;
        const existing = artistMap.get(name);
        if (existing) {
          existing.albumCount++;
          existing.trackCount += a.track_count;
          if (!existing.coverPath && a.cover_path) {
            existing.coverPath = a.cover_path;
          }
        } else {
          artistMap.set(name, {
            albumCount: 1,
            trackCount: a.track_count,
            coverPath: a.cover_path,
          });
        }
      }

      const list: Artist[] = Array.from(artistMap.entries())
        .map(([name, info]) => ({ name, ...info }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setArtists(list);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = search
    ? artists.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase())
      )
    : artists;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Artists</h1>
          <p className="text-muted-foreground mt-1">{artists.length} artists</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search artists..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filtered.map((artist, i) => (
            <motion.div
              key={artist.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.5) }}
            >
              <Link href={`/artists/${encodeURIComponent(artist.name)}`}>
                <Card className="hover:bg-secondary/50 transition-colors cursor-pointer text-center">
                  <CardContent className="p-4">
                    <div className="w-24 h-24 rounded-full bg-secondary mx-auto mb-3 flex items-center justify-center overflow-hidden">
                      {artist.coverPath ? (
                        <Image
                          src={artist.coverPath}
                          alt={artist.name}
                          width={96}
                          height={96}
                          className="object-cover rounded-full"
                        />
                      ) : (
                        <Mic2 className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <p className="font-medium truncate text-sm">{artist.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {artist.albumCount} album{artist.albumCount !== 1 ? "s" : ""}
                      {" · "}
                      {artist.trackCount} track{artist.trackCount !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Mic2 className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">No artists found</p>
        </div>
      )}
    </div>
  );
}
