"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/store/player";
import {
  Play,
  Disc3,
  Mic2,
  Loader2,
  TrendingUp,
  MapPin,
  Calendar,
  Music,
  Heart,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MoreHorizontal,
  ListPlus,
  RefreshCw,
  Award,
  ImageIcon,
  Archive,
  Pencil,
} from "lucide-react";
import { motion } from "framer-motion";
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog";
import { CoverSearchDialog } from "@/components/albums/CoverSearchDialog";

interface Album {
  album: string;
  album_artist: string;
  year: number | null;
  cover_path: string | null;
  track_count: number;
  total_duration: number;
}

interface ChartHit {
  title: string;
  year: number | null;
  peak: number | null;
  weeks: number | null;
  chart: string;
  certification?: string | null;
}

interface Certification {
  title: string;
  type: string;
  count?: number;
  country?: string;
}

interface ArtistIntel {
  status: string;
  summary: string | null;
  bornDate: string | null;
  bornPlace: string | null;
  genres: string[];
  activeYears: string | null;
  imageUrl: string | null;
  localImagePath: string | null;
  chartHits: ChartHit[];
  certifications: Certification[];
  wikipediaUrl: string | null;
}

type HitSort = "year" | "peak" | "title";

/** Gold/Platinum/Diamond disc icon */
function CertIcon({ cert }: { cert: string }) {
  const lower = cert.toLowerCase();
  if (lower.includes("diamond")) {
    return (
      <span title={cert} className="inline-flex items-center shrink-0">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
          <path d="M8 1L14 6L8 15L2 6L8 1Z" fill="#b9f2ff" stroke="#7dd3fc" strokeWidth="1" />
          <path d="M8 1L5 6H11L8 1Z" fill="#e0f7ff" />
        </svg>
      </span>
    );
  }
  if (lower.includes("platinum")) {
    return (
      <span title={cert} className="inline-flex items-center shrink-0">
        <Disc3 className="h-3.5 w-3.5 text-slate-300" />
      </span>
    );
  }
  if (lower.includes("gold")) {
    return (
      <span title={cert} className="inline-flex items-center shrink-0">
        <Disc3 className="h-3.5 w-3.5 text-amber-400" />
      </span>
    );
  }
  return null;
}

/** Certification summary badges */
function CertSummary({ certifications }: { certifications: Certification[] }) {
  if (!certifications || certifications.length === 0) return null;

  const counts = { gold: 0, platinum: 0, diamond: 0 };
  for (const c of certifications) {
    const t = c.type.toLowerCase();
    if (t.includes("diamond")) counts.diamond++;
    else if (t.includes("platinum")) counts.platinum++;
    else if (t.includes("gold")) counts.gold++;
  }

  const parts: { label: string; count: number; color: string }[] = [];
  if (counts.diamond > 0) parts.push({ label: "Diamond", count: counts.diamond, color: "text-cyan-300" });
  if (counts.platinum > 0) parts.push({ label: "Platinum", count: counts.platinum, color: "text-slate-300" });
  if (counts.gold > 0) parts.push({ label: "Gold", count: counts.gold, color: "text-amber-400" });

  if (parts.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <Award className="h-5 w-5 text-muted-foreground" />
      <div className="flex items-center gap-2 flex-wrap">
        {parts.map((p) => (
          <Badge key={p.label} variant="secondary" className="text-xs gap-1">
            <Disc3 className={`h-3 w-3 ${p.color}`} />
            {p.count} {p.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export default function ArtistDetailPage() {
  const params = useParams();
  const artistName = decodeURIComponent(params.name as string);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [intel, setIntel] = useState<ArtistIntel | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [hitSort, setHitSort] = useState<HitSort>("year");
  const [hitSortDir, setHitSortDir] = useState<"asc" | "desc">("asc");
  const [playlistTrackIds, setPlaylistTrackIds] = useState<number[]>([]);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [albumSort, setAlbumSort] = useState<"year" | "name" | "tracks">("year");
  const [albumSortDir, setAlbumSortDir] = useState<"asc" | "desc">("asc");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; album: Album } | null>(null);
  const [coverSearch, setCoverSearch] = useState<{ album: string; artist: string } | null>(null);
  const { setQueue } = usePlayerStore();

  // Track titles in library for matching chart hits: title → trackId
  const [libraryTracks, setLibraryTracks] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/albums?sort=year`);
      const data = await res.json();
      const allAlbums = data.albums || [];
      const artistAlbums = allAlbums.filter(
        (a: Album) =>
          a.album_artist.toLowerCase() === artistName.toLowerCase()
      );
      setAlbums(artistAlbums);
      setLoading(false);

      // Build map of track titles → track IDs for this artist
      const trackMap = new Map<string, number>();
      for (const album of artistAlbums) {
        const id = encodeURIComponent(`${album.album_artist}---${album.album}`);
        try {
          const albumRes = await fetch(`/api/albums/${id}`);
          const albumData = await albumRes.json();
          for (const t of albumData.tracks || []) {
            trackMap.set(t.title.toLowerCase(), t.id);
          }
        } catch {
          // Skip
        }
      }
      setLibraryTracks(trackMap);
    }
    load();
  }, [artistName]);

  // Fetch intel on mount
  useEffect(() => {
    async function loadIntel() {
      try {
        const res = await fetch(`/api/artists/${encodeURIComponent(artistName)}/intel`);
        const data = await res.json();
        if (data.status === "enriched") {
          setIntel(data);
        }
      } catch {
        // No cached intel
      }
    }
    loadIntel();
  }, [artistName]);

  const fetchIntel = useCallback(async (force = false) => {
    setIntelLoading(true);
    try {
      const url = `/api/artists/${encodeURIComponent(artistName)}/intel${force ? "?force=true" : ""}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      setIntel(data);
    } catch {
      // Failed
    }
    setIntelLoading(false);
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

  const playHitFromLibrary = async (hitTitle: string) => {
    const res = await fetch(`/api/library?search=${encodeURIComponent(hitTitle)}&limit=5`);
    const data = await res.json();
    const match = (data.tracks || []).find(
      (t: any) =>
        t.title.toLowerCase() === hitTitle.toLowerCase() &&
        (t.artist.toLowerCase() === artistName.toLowerCase() ||
         t.albumArtist?.toLowerCase() === artistName.toLowerCase())
    );
    if (match) {
      setQueue(
        [
          {
            id: match.id,
            title: match.title,
            artist: match.artist,
            album: match.album,
            duration: match.duration,
            filePath: match.filePath,
            coverPath: match.coverPath || undefined,
            source: "local" as const,
          },
        ],
        0
      );
    }
  };

  const addHitToPlaylist = (hitTitle: string) => {
    const trackId = libraryTracks.get(hitTitle.toLowerCase());
    if (trackId) {
      setPlaylistTrackIds([trackId]);
      setShowPlaylistDialog(true);
    }
  };

  const addHitToWishlist = async (hit: ChartHit) => {
    try {
      await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "artist_discovery",
          seedTitle: hit.title,
          seedArtist: artistName,
          status: "pending",
        }),
      });
    } catch {
      // Best effort
    }
  };

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const addAlbumToPlaylist = async (album: Album) => {
    const id = encodeURIComponent(`${album.album_artist}---${album.album}`);
    try {
      const res = await fetch(`/api/albums/${id}`);
      const data = await res.json();
      const ids = (data.tracks || []).map((t: any) => t.id);
      if (ids.length > 0) {
        setPlaylistTrackIds(ids);
        setShowPlaylistDialog(true);
      }
    } catch { /* skip */ }
  };

  const handleCoverUpdated = (coverPath: string) => {
    setAlbums((prev) =>
      prev.map((a) =>
        a.album === coverSearch?.album && a.album_artist === coverSearch?.artist
          ? { ...a, cover_path: coverPath }
          : a
      )
    );
    setCoverSearch(null);
  };

  const totalTracks = albums.reduce((sum, a) => sum + a.track_count, 0);
  const coverPath = albums.find((a) => a.cover_path)?.cover_path;

  // Sort albums
  const sortedAlbums = [...albums].sort((a, b) => {
    const dir = albumSortDir === "asc" ? 1 : -1;
    switch (albumSort) {
      case "year":
        return ((a.year || 0) - (b.year || 0)) * dir;
      case "name":
        return a.album.localeCompare(b.album) * dir;
      case "tracks":
        return (a.track_count - b.track_count) * dir;
      default:
        return 0;
    }
  });

  // Sort chart hits
  const sortedHits = intel?.chartHits
    ? [...intel.chartHits].sort((a, b) => {
        const dir = hitSortDir === "asc" ? 1 : -1;
        switch (hitSort) {
          case "year":
            return ((a.year || 9999) - (b.year || 9999)) * dir;
          case "peak":
            return ((a.peak || 999) - (b.peak || 999)) * dir;
          case "title":
            return a.title.localeCompare(b.title) * dir;
          default:
            return 0;
        }
      })
    : [];

  const toggleAlbumSort = (col: typeof albumSort) => {
    if (albumSort === col) {
      setAlbumSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setAlbumSort(col);
      setAlbumSortDir("asc");
    }
  };

  const toggleHitSort = (col: HitSort) => {
    if (hitSort === col) {
      setHitSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setHitSort(col);
      setHitSortDir("asc");
    }
  };

  const SortIcon = ({ col, active, dir }: { col: string; active: boolean; dir: "asc" | "desc" }) =>
    active ? (
      dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
    ) : (
      <ArrowUpDown className="h-3 w-3 opacity-30" />
    );

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
          {intel?.localImagePath || intel?.imageUrl ? (
            <img
              src={intel?.localImagePath || intel?.imageUrl || ""}
              alt={artistName}
              className="w-full h-full object-cover rounded-full"
            />
          ) : coverPath ? (
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
        <div className="flex-1">
          <p className="text-sm uppercase tracking-wider text-muted-foreground">
            Artist
          </p>
          <h1 className="text-4xl font-bold">{artistName}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-muted-foreground">
              {albums.length} album{albums.length !== 1 ? "s" : ""} · {totalTracks}{" "}
              track{totalTracks !== 1 ? "s" : ""}
            </p>
            {intel?.activeYears && (
              <Badge variant="secondary" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                {intel.activeYears}
              </Badge>
            )}
            {intel?.bornPlace && (
              <Badge variant="secondary" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {intel.bornPlace}
              </Badge>
            )}
            {intel?.genres?.map((g) => (
              <Badge key={g} variant="outline" className="text-xs capitalize">
                {g}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {intel?.wikipediaUrl && (
            <a href={intel.wikipediaUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm">
                <ExternalLink className="h-4 w-4 mr-1" />
                Wikipedia
              </Button>
            </a>
          )}
          {intel ? (
            <Button
              onClick={() => fetchIntel(true)}
              disabled={intelLoading}
              variant="ghost"
              size="sm"
              title="Refresh artist info"
            >
              <RefreshCw className={`h-4 w-4 ${intelLoading ? "animate-spin" : ""}`} />
            </Button>
          ) : (
            <Button onClick={() => fetchIntel()} disabled={intelLoading} variant="outline" size="sm">
              {intelLoading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4 mr-1" />
              )}
              {intelLoading ? "Fetching..." : "Get Artist Info"}
            </Button>
          )}
        </div>
      </div>

      {/* Artist bio */}
      {intel?.summary && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">About</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{intel.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Certifications summary */}
      {intel && intel.certifications && intel.certifications.length > 0 && (
        <CertSummary certifications={intel.certifications} />
      )}

      {/* Main content: Albums + Chart Hits side by side */}
      <div className="flex gap-6">
        {/* Albums column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xl font-semibold">Albums</h2>
            <div className="flex gap-1 text-xs">
              {(["year", "name", "tracks"] as const).map((col) => (
                <button
                  key={col}
                  onClick={() => toggleAlbumSort(col)}
                  className={`flex items-center gap-0.5 px-2 py-1 rounded transition-colors ${
                    albumSort === col ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {col === "year" ? "Year" : col === "name" ? "Name" : "Tracks"}
                  <SortIcon col={col} active={albumSort === col} dir={albumSortDir} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {sortedAlbums.map((album, i) => (
              <motion.div
                key={album.album}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/albums/${encodeURIComponent(`${album.album_artist}---${album.album}`)}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, album });
                  }}
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

        {/* Chart Hits column */}
        {intel && intel.chartHits.length > 0 && (
          <div className="w-96 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Singles</h2>
              <span className="text-xs text-muted-foreground">
                ({intel.chartHits.length})
              </span>
            </div>
            <Card>
              <CardContent className="p-0">
                {/* Sort header */}
                <div className="grid grid-cols-[1fr_50px_50px_28px] gap-1 px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                  <button
                    className={`flex items-center gap-1 hover:text-foreground transition-colors ${hitSort === "title" ? "text-foreground" : ""}`}
                    onClick={() => toggleHitSort("title")}
                  >
                    Song <SortIcon col="title" active={hitSort === "title"} dir={hitSortDir} />
                  </button>
                  <button
                    className={`flex items-center gap-1 hover:text-foreground transition-colors ${hitSort === "year" ? "text-foreground" : ""}`}
                    onClick={() => toggleHitSort("year")}
                  >
                    Year <SortIcon col="year" active={hitSort === "year"} dir={hitSortDir} />
                  </button>
                  <button
                    className={`flex items-center gap-1 hover:text-foreground transition-colors ${hitSort === "peak" ? "text-foreground" : ""}`}
                    onClick={() => toggleHitSort("peak")}
                  >
                    Peak <SortIcon col="peak" active={hitSort === "peak"} dir={hitSortDir} />
                  </button>
                  <span />
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {sortedHits.map((hit, i) => {
                    const inLibrary = libraryTracks.has(hit.title.toLowerCase());
                    return (
                      <div
                        key={`${hit.title}-${i}`}
                        className="grid grid-cols-[1fr_50px_50px_28px] gap-1 px-3 py-2 text-sm hover:bg-secondary/30 transition-colors group items-center border-b border-border/50 last:border-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {hit.certification && <CertIcon cert={hit.certification} />}
                          {inLibrary && (
                            <span title="In your library">
                              <Music className="h-3 w-3 text-green-400 shrink-0" />
                            </span>
                          )}
                          <span className={`truncate ${inLibrary ? "" : "text-muted-foreground"}`}>
                            {hit.title}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground text-center">
                          {hit.year || "—"}
                        </span>
                        <span className="text-xs text-center">
                          {hit.peak ? (
                            <span className={hit.peak <= 10 ? "text-primary font-bold" : "text-muted-foreground"}>
                              #{hit.peak}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                        {/* 3-dot menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-secondary">
                              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {inLibrary ? (
                              <>
                                <DropdownMenuItem onClick={() => playHitFromLibrary(hit.title)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Play
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => addHitToPlaylist(hit.title)}>
                                  <ListPlus className="h-4 w-4 mr-2" />
                                  Add to Playlist
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem onClick={() => addHitToWishlist(hit)}>
                                <Heart className="h-4 w-4 mr-2" />
                                Add to Wishlist
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Loading intel indicator */}
      {intelLoading && (
        <Card>
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Fetching artist information...</p>
              <p className="text-xs text-muted-foreground">
                Searching MusicBrainz, Wikipedia, and Wikidata
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Album context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              playAlbum(contextMenu.album);
              setContextMenu(null);
            }}
          >
            <Play className="h-4 w-4" />
            Play Album
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setCoverSearch({
                album: contextMenu.album.album,
                artist: contextMenu.album.album_artist,
              });
              setContextMenu(null);
            }}
          >
            <ImageIcon className="h-4 w-4" />
            Find Cover Art
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              addAlbumToPlaylist(contextMenu.album);
              setContextMenu(null);
            }}
          >
            <ListPlus className="h-4 w-4" />
            Add to Playlist
          </button>
        </div>
      )}

      {/* Cover search dialog */}
      {coverSearch && (
        <CoverSearchDialog
          open={!!coverSearch}
          onOpenChange={(open) => !open && setCoverSearch(null)}
          album={coverSearch.album}
          albumArtist={coverSearch.artist}
          onCoverUpdated={handleCoverUpdated}
        />
      )}

      {/* Add to playlist dialog */}
      <AddToPlaylistDialog
        open={showPlaylistDialog}
        onOpenChange={setShowPlaylistDialog}
        trackIds={playlistTrackIds}
      />
    </div>
  );
}
