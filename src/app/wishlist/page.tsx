"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Heart,
  Music2,
  Search,
  X,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  CheckCircle,
  Filter,
  Copy,
  ChevronDownIcon,
} from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";

interface WishListItem {
  id: number;
  type: string;
  seedTitle: string | null;
  seedArtist: string | null;
  seedAlbum: string | null;
  spotifyUri: string | null;
  isrc: string | null;
  coverUrl: string | null;
  spotifyPlaylistNames: string | null;
  status: string;
  createdAt: string;
}

type SortField = "title" | "artist" | "album" | "status" | "playlists";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "pending" | "downloading" | "completed" | "dismissed";

export default function WishlistPage() {
  const [items, setItems] = useState<WishListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("artist");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"spotify">("spotify");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState<string>("all");
  const [playlistDropdownOpen, setPlaylistDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!playlistDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPlaylistDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playlistDropdownOpen]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wishlist?limit=10000");
      const data = await res.json();
      setItems(data.items || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const dismissItem = async (id: number) => {
    await fetch("/api/wishlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "dismissed" }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "dismissed" } : i)));
  };

  const downloadItem = async (id: number) => {
    setDownloadingIds((prev) => new Set(prev).add(id));
    try {
      await fetch("/api/spotify/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {}
    // Poll status
    setTimeout(fetchItems, 5000);
  };

  const [dupeProgress, setDupeProgress] = useState<{
    active: boolean;
    total: number;
    done: number;
    logs: string[];
    error?: string;
  } | null>(null);

  const parsePlaylistNames = (json: string | null): string[] => {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  const dismissDuplicates = async () => {
    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(msg);
      setDupeProgress((p) => p ? { ...p, logs: [...logs] } : null);
    };

    addLog(`Found ${dupeData.totalGroups} groups with duplicate rows (${dupeData.extraCount} extra entries).`);

    // For each dupe group, keep the best row, dismiss all other PENDING rows
    const toDismiss: number[] = [];

    for (const [key, group] of dupeData.dupeGroups) {
      // Sort: prefer pending > completed > downloading > dismissed, then most playlists
      const sorted = [...group].sort((a, b) => {
        const statusOrder: Record<string, number> = { pending: 0, completed: 1, downloading: 2, dismissed: 3 };
        const sa = statusOrder[a.status] ?? 4;
        const sb = statusOrder[b.status] ?? 4;
        if (sa !== sb) return sa - sb;
        return parsePlaylistNames(b.spotifyPlaylistNames).length - parsePlaylistNames(a.spotifyPlaylistNames).length;
      });

      const kept = sorted[0];
      const extras = sorted.slice(1).filter((i) => i.status === "pending");

      if (extras.length > 0) {
        const [artist, title] = key.split("::");
        addLog(`"${title}" by ${artist} — keeping id:${kept.id}, dismissing ${extras.length} extra(s)`);
        for (const e of extras) toDismiss.push(e.id);
      }
    }

    addLog(`${toDismiss.length} pending duplicates to dismiss.`);

    if (toDismiss.length === 0) {
      addLog("All duplicates are already dismissed — nothing to do.");
      setDupeProgress({ active: false, total: 0, done: 0, logs: [...logs] });
      return;
    }

    setDupeProgress({ active: true, total: toDismiss.length, done: 0, logs: [...logs] });

    // Process in batches of 200
    const BATCH_SIZE = 200;
    let dismissed = 0;
    let errors = 0;

    for (let i = 0; i < toDismiss.length; i += BATCH_SIZE) {
      const batch = toDismiss.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toDismiss.length / BATCH_SIZE);

      addLog(`Batch ${batchNum}/${totalBatches}: dismissing ${batch.length} items...`);

      try {
        const res = await fetch("/api/wishlist", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch, status: "dismissed" }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          addLog(`ERROR: Batch ${batchNum} failed (${res.status}): ${errData.error || res.statusText}`);
          errors++;
        } else {
          dismissed += batch.length;
          addLog(`Batch ${batchNum} done — ${dismissed}/${toDismiss.length} dismissed.`);
        }
      } catch (err) {
        addLog(`ERROR: Batch ${batchNum} network error: ${err instanceof Error ? err.message : String(err)}`);
        errors++;
      }

      setDupeProgress((p) => p ? { ...p, done: dismissed } : null);
    }

    // Update local state
    const dismissSet = new Set(toDismiss);
    setItems((prev) =>
      prev.map((i) => (dismissSet.has(i.id) ? { ...i, status: "dismissed" } : i))
    );

    if (errors > 0) {
      addLog(`Completed with ${errors} error(s). ${dismissed} of ${toDismiss.length} dismissed.`);
      setDupeProgress((p) => p ? { ...p, active: false, done: dismissed, error: `${errors} batch(es) failed` } : null);
    } else {
      addLog(`Done! ${dismissed} duplicates dismissed successfully.`);
      setDupeProgress((p) => p ? { ...p, active: false, done: dismissed } : null);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3" />;
  };

  // Extract all unique playlist names for the dropdown
  const allPlaylistNames = useMemo(() => {
    const names = new Set<string>();
    items
      .filter((i) => i.type === "spotify_missing")
      .forEach((i) => parsePlaylistNames(i.spotifyPlaylistNames).forEach((n) => names.add(n)));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Build a map of normalized artist+title → item IDs (row-level duplicates)
  const dupeData = useMemo(() => {
    const spotify = items.filter((i) => i.type === "spotify_missing");
    const groups = new Map<string, WishListItem[]>();
    for (const item of spotify) {
      const key = `${(item.seedArtist || "").trim().toLowerCase()}::${(item.seedTitle || "").trim().toLowerCase()}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }
    // Only groups with 2+ rows are duplicates
    const dupeGroups = new Map<string, WishListItem[]>();
    const dupeIdSet = new Set<number>();
    let extraCount = 0;
    let pendingExtras = 0;

    for (const [key, group] of groups) {
      if (group.length > 1) {
        dupeGroups.set(key, group);
        for (const item of group) dupeIdSet.add(item.id);
        extraCount += group.length - 1;
        // Count pending items that would be dismissed (all but the "best" one)
        const sorted = [...group].sort((a, b) => {
          // Prefer pending > completed > downloading > dismissed
          const statusOrder: Record<string, number> = { pending: 0, completed: 1, downloading: 2, dismissed: 3 };
          const sa = statusOrder[a.status] ?? 4;
          const sb = statusOrder[b.status] ?? 4;
          if (sa !== sb) return sa - sb;
          // Among same status, prefer more playlists
          return parsePlaylistNames(b.spotifyPlaylistNames).length - parsePlaylistNames(a.spotifyPlaylistNames).length;
        });
        // All except the first (best) that are pending can be dismissed
        for (const item of sorted.slice(1)) {
          if (item.status === "pending") pendingExtras++;
        }
      }
    }

    return { dupeGroups, dupeIdSet, totalGroups: dupeGroups.size, extraCount, pendingExtras };
  }, [items]);

  const filteredAndSorted = useMemo(() => {
    let result = items.filter((i) => i.type === "spotify_missing");

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((i) => i.status === statusFilter);
    }

    // Duplicates filter — show all rows involved in duplicate groups
    if (duplicatesOnly) {
      result = result.filter((i) => dupeData.dupeIdSet.has(i.id));
    }

    // Playlist filter
    if (playlistFilter !== "all") {
      result = result.filter((i) =>
        parsePlaylistNames(i.spotifyPlaylistNames).includes(playlistFilter)
      );
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          (i.seedTitle || "").toLowerCase().includes(q) ||
          (i.seedArtist || "").toLowerCase().includes(q) ||
          (i.seedAlbum || "").toLowerCase().includes(q) ||
          parsePlaylistNames(i.spotifyPlaylistNames).some((p) => p.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = (a.seedTitle || "").localeCompare(b.seedTitle || "");
      else if (sortField === "artist") cmp = (a.seedArtist || "").localeCompare(b.seedArtist || "");
      else if (sortField === "album") cmp = (a.seedAlbum || "").localeCompare(b.seedAlbum || "");
      else if (sortField === "status") cmp = a.status.localeCompare(b.status);
      else if (sortField === "playlists") {
        const ap = parsePlaylistNames(a.spotifyPlaylistNames);
        const bp = parsePlaylistNames(b.spotifyPlaylistNames);
        cmp = ap.length - bp.length;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, search, sortField, sortDir, statusFilter, duplicatesOnly, playlistFilter, dupeData]);

  const statusCounts = useMemo(() => {
    const spotify = items.filter((i) => i.type === "spotify_missing");
    return {
      all: spotify.length,
      pending: spotify.filter((i) => i.status === "pending").length,
      downloading: spotify.filter((i) => i.status === "downloading").length,
      completed: spotify.filter((i) => i.status === "completed").length,
      dismissed: spotify.filter((i) => i.status === "dismissed").length,
    };
  }, [items]);

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "text-orange-400";
      case "downloading": return "text-blue-400";
      case "completed": return "text-green-400";
      case "dismissed": return "text-muted-foreground";
      default: return "";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold">Wishlist</h1>
        <p className="text-muted-foreground mt-1">
          Tracks you want but don&apos;t have in your local library
        </p>
      </div>

      {/* Sub-category tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        <Button
          variant={tab === "spotify" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setTab("spotify")}
          className="gap-2"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#1DB954]" aria-hidden>
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          From Spotify
          <Badge variant="secondary" className="text-xs">{statusCounts.all}</Badge>
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[400px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tracks, artists, albums, playlists..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "pending", "completed", "dismissed"] as StatusFilter[]).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="text-xs capitalize"
            >
              {s} {s !== "all" && <span className="ml-1 opacity-60">({statusCounts[s]})</span>}
            </Button>
          ))}
        </div>
      </div>

      {/* Advanced filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Duplicates filter */}
        <div className="flex items-center gap-2">
          <Button
            variant={duplicatesOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setDuplicatesOnly(!duplicatesOnly)}
            className="text-xs gap-1.5"
          >
            <Copy className="h-3 w-3" />
            Duplicates
            <span className="opacity-60">
              ({dupeData.extraCount}{dupeData.pendingExtras > 0 && dupeData.pendingExtras !== dupeData.extraCount
                ? `, ${dupeData.pendingExtras} pending`
                : ""})
            </span>
          </Button>
          {duplicatesOnly && dupeData.pendingExtras > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 text-orange-400 border-orange-400/30 hover:bg-orange-400/10"
              onClick={dismissDuplicates}
              disabled={dupeProgress?.active}
            >
              {dupeProgress?.active ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
              Remove {dupeData.pendingExtras} Dupes
            </Button>
          )}
          {duplicatesOnly && dupeData.pendingExtras === 0 && dupeData.extraCount > 0 && (
            <span className="text-xs text-muted-foreground">All dupes already dismissed</span>
          )}
        </div>

        {/* Playlist filter dropdown */}
        <div className="relative" ref={dropdownRef}>
          <Button
            variant={playlistFilter !== "all" ? "secondary" : "outline"}
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setPlaylistDropdownOpen(!playlistDropdownOpen)}
          >
            <Filter className="h-3 w-3" />
            {playlistFilter === "all" ? "All Playlists" : playlistFilter}
            <ChevronDownIcon className="h-3 w-3 opacity-60" />
          </Button>
          {playlistDropdownOpen && (
            <div
              className="absolute top-full left-0 mt-1 w-64 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg z-50"
            >
              <button
                className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-secondary/50 ${
                  playlistFilter === "all" ? "bg-secondary text-primary" : ""
                }`}
                onClick={() => {
                  setPlaylistFilter("all");
                  setPlaylistDropdownOpen(false);
                }}
              >
                All Playlists
              </button>
              {allPlaylistNames.map((name) => (
                <button
                  key={name}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-secondary/50 truncate ${
                    playlistFilter === name ? "bg-secondary text-primary" : ""
                  }`}
                  onClick={() => {
                    setPlaylistFilter(name);
                    setPlaylistDropdownOpen(false);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clear filters */}
        {(duplicatesOnly || playlistFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              setDuplicatesOnly(false);
              setPlaylistFilter("all");
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Dupe removal progress panel */}
      {dupeProgress && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {dupeProgress.active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : dupeProgress.error ? (
                  <X className="h-4 w-4 text-red-400" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                )}
                <span className="text-sm font-medium">
                  {dupeProgress.active
                    ? `Removing duplicates... ${dupeProgress.done}/${dupeProgress.total}`
                    : dupeProgress.error
                      ? `Completed with errors`
                      : `Done — ${dupeProgress.done} duplicates removed`}
                </span>
              </div>
              {!dupeProgress.active && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setDupeProgress(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {dupeProgress.total > 0 && (
              <Progress
                value={dupeProgress.total > 0 ? (dupeProgress.done / dupeProgress.total) * 100 : 0}
                className="h-1.5"
              />
            )}
            {/* Log output */}
            <div className="max-h-32 overflow-y-auto rounded bg-black/30 p-2 font-mono text-[11px] text-muted-foreground space-y-0.5">
              {dupeProgress.logs.map((log, i) => (
                <p key={i} className={log.startsWith("ERROR") ? "text-red-400" : ""}>
                  {log}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results summary */}
      <p className="text-xs text-muted-foreground">
        Showing {filteredAndSorted.length} of {statusCounts.all} tracks
      </p>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="py-16 text-center">
          <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-lg text-muted-foreground">
            {items.length === 0 ? "No wishlist items yet" : "No items match your filter"}
          </p>
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Run a Spotify extraction from Settings to populate your wishlist
            </p>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 w-10"></th>
                    <th className="px-2 py-3">
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSort("title")}
                      >
                        Title <SortIcon field="title" />
                      </button>
                    </th>
                    <th className="px-2 py-3">
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSort("artist")}
                      >
                        Artist <SortIcon field="artist" />
                      </button>
                    </th>
                    <th className="px-2 py-3">
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSort("album")}
                      >
                        Album <SortIcon field="album" />
                      </button>
                    </th>
                    <th className="px-2 py-3">
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSort("playlists")}
                      >
                        Playlists <SortIcon field="playlists" />
                      </button>
                    </th>
                    <th className="px-2 py-3">
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSort("status")}
                      >
                        Status <SortIcon field="status" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSorted.map((item) => {
                    const plNames = parsePlaylistNames(item.spotifyPlaylistNames);
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-border/50 hover:bg-secondary/30 transition-colors group"
                      >
                        <td className="px-4 py-2.5">
                          <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                            {item.coverUrl ? (
                              <Image
                                src={item.coverUrl}
                                alt={item.seedTitle || ""}
                                width={32}
                                height={32}
                                className="object-cover"
                              />
                            ) : (
                              <Music2 className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <p className="font-medium truncate max-w-[200px]">{item.seedTitle || "Unknown"}</p>
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground">
                          <p className="truncate max-w-[160px]">{item.seedArtist || "Unknown"}</p>
                        </td>
                        <td className="px-2 py-2.5 text-muted-foreground">
                          <p className="truncate max-w-[160px]">{item.seedAlbum || ""}</p>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {plNames.slice(0, 2).map((name, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] truncate max-w-[120px]">
                                {name}
                              </Badge>
                            ))}
                            {plNames.length > 2 && (
                              <Badge variant="outline" className="text-[10px]">
                                +{plNames.length - 2}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`text-xs capitalize ${statusColor(item.status)}`}>
                            {item.status === "downloading" && (
                              <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                            )}
                            {item.status === "completed" && (
                              <CheckCircle className="h-3 w-3 inline mr-1" />
                            )}
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.spotifyUri && (
                              <a
                                href={`https://open.spotify.com/track/${item.spotifyUri.replace("spotify:track:", "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </a>
                            )}
                            {item.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => dismissItem(item.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
