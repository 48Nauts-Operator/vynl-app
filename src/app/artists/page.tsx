"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic2, Search, Loader2, LayoutGrid, List, X } from "lucide-react";
import { motion } from "framer-motion";
import { AlphabetSidebar } from "@/components/albums/AlphabetSidebar";

interface Artist {
  name: string;
  albumCount: number;
  trackCount: number;
  coverPath: string | null;
  artistImage: string | null; // Local artist photo from intel
  genres: string[];
}

export default function ArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [activeLetter, setActiveLetter] = useState<string | undefined>();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [albumsRes, imagesRes] = await Promise.all([
        fetch(`/api/albums?${genre ? `genre=${genre}` : ""}`),
        fetch("/api/artists/images"),
      ]);
      const data = await albumsRes.json();
      const artistImages: Record<string, string> = await imagesRes.json().catch(() => ({}));
      const albums = data.albums || [];

      // Group albums by artist
      const artistMap = new Map<
        string,
        { albumCount: number; trackCount: number; coverPath: string | null; genres: Set<string> }
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
          if (a.genre) existing.genres.add(a.genre);
        } else {
          const genres = new Set<string>();
          if (a.genre) genres.add(a.genre);
          artistMap.set(name, {
            albumCount: 1,
            trackCount: a.track_count,
            coverPath: a.cover_path,
            genres,
          });
        }
      }

      const list: Artist[] = Array.from(artistMap.entries())
        .map(([name, info]) => ({
          name,
          ...info,
          artistImage: artistImages[name] || null,
          genres: Array.from(info.genres),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setArtists(list);
      if (data.genres) setAllGenres(data.genres);
      setLoading(false);
    }
    load();
  }, [genre]);

  // Clear letter filter when genre changes
  useEffect(() => {
    setActiveLetter(undefined);
  }, [genre]);

  const getLetterForArtist = (artist: Artist): string => {
    const first = artist.name.charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : "#";
  };

  const filtered = useMemo(() => {
    let result = artists;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a) => a.name.toLowerCase().includes(q));
    }
    if (activeLetter) {
      result = result.filter((a) => getLetterForArtist(a) === activeLetter);
    }
    return result;
  }, [artists, search, activeLetter]);

  // Map artists for AlphabetSidebar compatibility
  const sidebarAlbums = useMemo(
    () => artists.map((a) => ({ album: a.name, album_artist: a.name })),
    [artists]
  );

  const handleLetterSelect = (letter: string) => {
    setActiveLetter(letter || undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Artists</h1>
          <p className="text-muted-foreground mt-1">
            {activeLetter
              ? `${filtered.length} of ${artists.length} artists — "${activeLetter}"`
              : `${artists.length} artists`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search artists..."
              className="pl-9 w-[200px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={genre || "all"} onValueChange={(v) => setGenre(v === "all" ? null : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All genres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genres</SelectItem>
              {allGenres.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border border-border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && viewMode === "grid" && (
        <div className="flex gap-1">
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                        {artist.artistImage ? (
                          <img
                            src={artist.artistImage}
                            alt={artist.name}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : artist.coverPath ? (
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
          {artists.length > 0 && (
            <AlphabetSidebar
              albums={sidebarAlbums}
              sortField="album_artist"
              onLetterSelect={handleLetterSelect}
              activeLetter={activeLetter}
            />
          )}
        </div>
      )}

      {!loading && viewMode === "list" && (
        <div className="flex gap-1">
          <div className="flex-1 space-y-1">
            {filtered.map((artist, i) => (
              <motion.div
                key={artist.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.01, 0.3) }}
              >
                <Link href={`/artists/${encodeURIComponent(artist.name)}`}>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                      {artist.artistImage ? (
                        <img
                          src={artist.artistImage}
                          alt={artist.name}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : artist.coverPath ? (
                        <Image
                          src={artist.coverPath}
                          alt={artist.name}
                          width={48}
                          height={48}
                          className="object-cover rounded-full"
                        />
                      ) : (
                        <Mic2 className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{artist.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {artist.genres.slice(0, 3).join(", ") || "Unknown genre"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 text-right">
                      <p>{artist.albumCount} album{artist.albumCount !== 1 ? "s" : ""}</p>
                      <p>{artist.trackCount} tracks</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
          {artists.length > 0 && (
            <AlphabetSidebar
              albums={sidebarAlbums}
              sortField="album_artist"
              onLetterSelect={handleLetterSelect}
              activeLetter={activeLetter}
            />
          )}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Mic2 className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">
            {activeLetter ? `No artists starting with "${activeLetter}"` : "No artists found"}
          </p>
          {activeLetter && (
            <button onClick={() => setActiveLetter(undefined)} className="text-sm text-primary hover:underline mt-1">
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
