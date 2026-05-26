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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlayerStore } from "@/store/player";
import { Disc3, Play, Loader2, ImageIcon, Pencil, LayoutGrid, List, Archive, ListPlus, Search, X } from "lucide-react";
import { motion } from "framer-motion";
import { CoverSearchDialog } from "@/components/albums/CoverSearchDialog";
import { GenreFilter } from "@/components/GenreFilter";
import { AddToPlaylistDialog } from "@/components/playlists/AddToPlaylistDialog";
import { AlphabetSidebar } from "@/components/albums/AlphabetSidebar";

interface Album {
  album: string;
  album_artist: string;
  year: number | null;
  cover_path: string | null;
  genre: string | null;
  track_count: number;
  total_duration: number;
  first_track_id: number;
  is_compilation: number;
}

type AlbumType = "albums" | "compilations" | "singles";

const ALBUM_TYPE_LABELS: { id: AlbumType; label: string }[] = [
  { id: "albums", label: "Albums" },
  { id: "compilations", label: "Compilations" },
  { id: "singles", label: "Singles" },
];

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [sort, setSort] = useState("artist");
  const [since, setSince] = useState("all");
  const [genre, setGenre] = useState<string | null>(null);
  // Multi-select toggle: each type is independently on/off. All three on
  // by default = show everything (no API filter). Mirrors the visual
  // "On Air" buttons. Persisted to localStorage so navigating away and
  // back preserves the last-set state (without it the filters reset to
  // all-on on every mount, which is annoying when iterating).
  const ALBUM_TYPES_STORAGE_KEY = "vynl:albums:activeTypes";
  const [activeTypes, setActiveTypes] = useState<Set<AlbumType>>(() => {
    if (typeof window === "undefined") {
      return new Set(["albums", "compilations", "singles"]);
    }
    try {
      const raw = window.localStorage.getItem(ALBUM_TYPES_STORAGE_KEY);
      if (!raw) return new Set(["albums", "compilations", "singles"]);
      const arr = JSON.parse(raw) as string[];
      const valid: AlbumType[] = ["albums", "compilations", "singles"];
      const filtered = arr.filter((t): t is AlbumType => valid.includes(t as AlbumType));
      return new Set(filtered);
    } catch {
      return new Set(["albums", "compilations", "singles"]);
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        ALBUM_TYPES_STORAGE_KEY,
        JSON.stringify(Array.from(activeTypes))
      );
    } catch { /* quota / privacy mode — ignore */ }
  }, [activeTypes]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [coverSearch, setCoverSearch] = useState<{ album: string; artist: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; album: Album } | null>(null);
  const [renaming, setRenaming] = useState<Album | null>(null);
  const [renameAlbum, setRenameAlbum] = useState("");
  const [renameArtist, setRenameArtist] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [archiving, setArchiving] = useState<Album | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [playlistTrackIds, setPlaylistTrackIds] = useState<number[]>([]);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string | undefined>();
  const { setQueue } = usePlayerStore();

  const showSidebar = sort === "artist" || sort === "name";

  const getLetterForAlbum = (album: Album): string => {
    const first = (album.album || "").charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : "#";
  };

  // Filter albums by selected letter
  const filteredAlbums = activeLetter
    ? albums.filter((a) => getLetterForAlbum(a) === activeLetter)
    : albums;

  const handleLetterSelect = (letter: string) => {
    setActiveLetter(letter || undefined);
    // Scroll to top when filtering
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Clear letter filter when sort changes
  useEffect(() => {
    setActiveLetter(undefined);
  }, [sort]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ sort });
      if (genre) params.set("genre", genre);
      if (search.trim()) params.set("search", search.trim());
      if (since && since !== "all") params.set("since", since);
      // Send types only when it's not the default all-three (otherwise
      // omit to let the API skip the HAVING clause entirely).
      if (activeTypes.size > 0 && activeTypes.size < 3) {
        params.set("types", Array.from(activeTypes).join(","));
      } else if (activeTypes.size === 0) {
        // All toggles off = explicit empty filter (returns nothing).
        params.set("types", "none");
      }
      const res = await fetch(`/api/albums?${params}`);
      const data = await res.json();
      setAlbums(data.albums || []);
      setGenres(data.genres || []);
      setLoading(false);
    }
    // Debounce search input
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [sort, genre, search, activeTypes, since]);

  const toggleType = (id: AlbumType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

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
        albumArtist: t.albumArtist || album.album_artist,
        duration: t.duration,
        filePath: t.filePath,
        coverPath: t.coverPath || undefined,
        source: "local" as const,
      }));
      setQueue(playerTracks, 0);
    }
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

  const refreshAlbums = async () => {
    const params = new URLSearchParams({ sort });
    if (genre) params.set("genre", genre);
    const res = await fetch(`/api/albums?${params}`);
    const data = await res.json();
    setAlbums(data.albums || []);
  };

  const handleArchive = async () => {
    if (!archiving) return;
    setArchiveLoading(true);
    try {
      await fetch("/api/library/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          album: archiving.album,
          albumArtist: archiving.album_artist,
        }),
      });
      await refreshAlbums();
    } catch {}
    setArchiveLoading(false);
    setArchiving(null);
  };

  const addAlbumToPlaylist = async (album: Album) => {
    const id = encodeURIComponent(`${album.album_artist}---${album.album}`);
    const res = await fetch(`/api/albums/${id}`);
    const data = await res.json();
    if (data.tracks) {
      setPlaylistTrackIds(data.tracks.map((t: any) => t.id));
      setShowPlaylistDialog(true);
    }
  };

  const startRename = (album: Album) => {
    setRenaming(album);
    setRenameAlbum(album.album);
    setRenameArtist(album.album_artist);
  };

  const handleRename = async () => {
    if (!renaming || !renameAlbum.trim()) return;
    setRenameLoading(true);
    try {
      await fetch("/api/albums/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldAlbum: renaming.album,
          oldAlbumArtist: renaming.album_artist,
          newAlbum: renameAlbum.trim(),
          newAlbumArtist: renameArtist.trim() || undefined,
        }),
      });
      await refreshAlbums();
    } catch {}
    setRenameLoading(false);
    setRenaming(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Albums</h1>
          <p className="text-muted-foreground mt-1">
            {activeLetter
              ? `${filteredAlbums.length} of ${albums.length} albums — "${activeLetter}"`
              : `${albums.length} albums`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search albums, artists, songs..."
              className="pl-9 w-[220px]"
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
          <GenreFilter genres={genres} value={genre} onChange={setGenre} />
          {/* "On Air" style neon toggles — all lit = show everything; tap
              to dim a category out of the view. Purple/pink palette
              matches the existing splash screen glow. */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-black/20 p-1">
            {ALBUM_TYPE_LABELS.map(({ id, label }) => {
              const on = activeTypes.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleType(id)}
                  className={
                    "relative px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide transition-all duration-200 " +
                    (on
                      ? "text-[#f0abfc] bg-[#a855f7]/10 shadow-[inset_0_0_10px_rgba(168,85,247,0.35),0_0_14px_rgba(236,72,153,0.5)]"
                      : "text-muted-foreground/60 hover:text-foreground/80")
                  }
                  aria-pressed={on}
                  title={on ? `Showing ${label}. Click to hide.` : `Hidden. Click to show ${label}.`}
                >
                  <span
                    className={
                      "inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle transition-all " +
                      (on
                        ? "bg-[#ec4899] shadow-[0_0_8px_#ec4899,0_0_2px_#fff] animate-pulse"
                        : "bg-muted-foreground/30")
                    }
                  />
                  {label}
                </button>
              );
            })}
          </div>
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
          <Select value={since} onValueChange={setSince}>
            <SelectTrigger className="w-[140px]" title="Show only albums with tracks added in this window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
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
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAlbums.map((album, i) => (
              <motion.div
                key={`${album.album_artist}-${album.album}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.5) }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, album });
                }}
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
                        {album.is_compilation === 1 && (
                          <span
                            className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-[#fdf4ff] bg-black/60 backdrop-blur-sm border border-[#a855f7]/60 shadow-[0_0_8px_rgba(236,72,153,0.5)]"
                            title="Compilation (Various Artists)"
                          >
                            VA
                          </span>
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
          {showSidebar && albums.length > 0 && (
            <AlphabetSidebar
              albums={albums}
              sortField="album"
              onLetterSelect={handleLetterSelect}
              activeLetter={activeLetter}
            />
          )}
        </div>
      )}

      {!loading && viewMode === "list" && (
        <div className="flex gap-1">
          <div className="flex-1 space-y-1">
            {filteredAlbums.map((album, i) => (
              <motion.div
                key={`${album.album_artist}-${album.album}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.01, 0.3) }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, album });
                }}
              >
                <Link
                  href={`/albums/${encodeURIComponent(`${album.album_artist}---${album.album}`)}`}
                >
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group">
                    <div className="h-12 w-12 rounded bg-secondary flex items-center justify-center overflow-hidden relative shrink-0">
                      {album.cover_path ? (
                        <Image
                          src={album.cover_path}
                          alt={album.album}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      ) : (
                        <Disc3 className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm flex items-center gap-1.5">
                        {album.is_compilation === 1 && (
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded text-[#fdf4ff] bg-[#a855f7]/15 border border-[#a855f7]/60 shadow-[0_0_6px_rgba(236,72,153,0.4)] shrink-0"
                            title="Compilation (Various Artists)"
                          >
                            VA
                          </span>
                        )}
                        <span className="truncate">{album.album}</span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {album.album_artist}
                        {album.year ? ` · ${album.year}` : ""}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 text-right">
                      <p>{album.track_count} tracks</p>
                      <p>{Math.floor(album.total_duration / 60)} min</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        playAlbum(album);
                      }}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
          {showSidebar && albums.length > 0 && (
            <AlphabetSidebar
              albums={albums}
              sortField="album"
              onLetterSelect={handleLetterSelect}
              activeLetter={activeLetter}
            />
          )}
        </div>
      )}

      {/* Custom context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
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
              startRename(contextMenu.album);
              setContextMenu(null);
            }}
          >
            <Pencil className="h-4 w-4" />
            Rename Album
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
          <div className="my-1 border-t border-border" />
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-destructive/10 text-destructive hover:text-destructive"
            onClick={() => {
              setArchiving(contextMenu.album);
              setContextMenu(null);
            }}
          >
            <Archive className="h-4 w-4" />
            Archive Album
          </button>
        </div>
      )}

      {!loading && filteredAlbums.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Disc3 className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">
            {activeLetter ? `No albums starting with "${activeLetter}"` : "No albums found"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {activeLetter ? (
              <button onClick={() => setActiveLetter(undefined)} className="text-primary hover:underline">
                Clear filter
              </button>
            ) : (
              "Scan your music library to get started"
            )}
          </p>
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

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiving} onOpenChange={(open) => !open && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Album</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Archive <strong>{archiving?.album}</strong> by{" "}
            <strong>{archiving?.album_artist}</strong>? Files will be moved to
            the archive folder and can be restored later.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setArchiving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={archiveLoading}
            >
              {archiveLoading ? "Archiving..." : "Archive"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to playlist dialog */}
      <AddToPlaylistDialog
        open={showPlaylistDialog}
        onOpenChange={setShowPlaylistDialog}
        trackIds={playlistTrackIds}
      />

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Album</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Album Name</Label>
              <Input
                value={renameAlbum}
                onChange={(e) => setRenameAlbum(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
              />
            </div>
            <div className="space-y-2">
              <Label>Album Artist</Label>
              <Input
                value={renameArtist}
                onChange={(e) => setRenameArtist(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
              />
            </div>
            <Button
              onClick={handleRename}
              disabled={renameLoading || !renameAlbum.trim()}
            >
              {renameLoading ? "Renaming..." : "Rename"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
