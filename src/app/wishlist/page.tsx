"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  Trash2,
  Package,
  Ban,
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
  popularity: number | null;
  status: string;
  createdAt: string;
}

// Enriched item with pre-parsed playlist names
interface EnrichedItem extends WishListItem {
  _plNames: string[];
  _searchKey: string; // pre-lowercased search target
}

type SortField = "title" | "artist" | "album" | "status" | "playlists" | "popularity";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "pending" | "downloading" | "completed" | "dismissed";

function parsePlaylistNames(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

/** Debounce hook */
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

const ROW_HEIGHT = 44;

export default function WishlistPage() {
  const [rawItems, setRawItems] = useState<WishListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [sortField, setSortField] = useState<SortField>("artist");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tab, setTab] = useState<"spotify">("spotify");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState<string>("all");
  const [playlistDropdownOpen, setPlaylistDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

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
      const res = await fetch("/api/wishlist?limit=50000");
      const data = await res.json();
      setRawItems(data.items || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  // Pre-enrich items once: parse playlist names + build search key
  const items = useMemo<EnrichedItem[]>(() =>
    rawItems.map((i) => {
      const _plNames = parsePlaylistNames(i.spotifyPlaylistNames);
      return {
        ...i,
        _plNames,
        _searchKey: `${(i.seedTitle || "").toLowerCase()}\t${(i.seedArtist || "").toLowerCase()}\t${(i.seedAlbum || "").toLowerCase()}\t${_plNames.join(" ").toLowerCase()}`,
      };
    }),
  [rawItems]);

  const dismissItem = async (id: number) => {
    await fetch("/api/wishlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "dismissed" }),
    });
    setRawItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "dismissed" } : i)));
  };

  const deleteItem = async (id: number) => {
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setRawItems((prev) => prev.filter((i) => i.id !== id));
  };

  const [dupeProgress, setDupeProgress] = useState<{
    active: boolean;
    total: number;
    done: number;
    logs: string[];
    error?: string;
  } | null>(null);

  // Lidarr push state
  const [lidarrPush, setLidarrPush] = useState<{
    status: string;
    totalArtists: number;
    processed: number;
    added: number;
    skipped: number;
    errors: number;
    updatedItems: number;
    currentArtist?: string;
    errorMessage?: string;
  } | null>(null);
  const [lidarrPushRunning, setLidarrPushRunning] = useState(false);
  const [lidarrConfigured, setLidarrConfigured] = useState(false);

  // Check Lidarr config + running push job on mount
  useEffect(() => {
    fetch("/api/lidarr/config").then((r) => r.json()).then((data) => {
      if (data.configured) setLidarrConfigured(true);
    }).catch(() => {});
    fetch("/api/lidarr/push").then((r) => r.json()).then((data) => {
      if (data.status === "running") {
        setLidarrPush(data);
        setLidarrPushRunning(true);
      }
    }).catch(() => {});
  }, []);

  const startLidarrPush = async () => {
    setLidarrPushRunning(true);
    setLidarrPush(null);
    try {
      const res = await fetch("/api/lidarr/push", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setLidarrPush({ status: "error", totalArtists: 0, processed: 0, added: 0, skipped: 0, errors: 0, updatedItems: 0, errorMessage: data.error });
        setLidarrPushRunning(false);
      }
    } catch {
      setLidarrPushRunning(false);
    }
  };

  const cancelLidarrPush = async () => {
    try { await fetch("/api/lidarr/push", { method: "DELETE" }); } catch {}
  };

  // Poll Lidarr push job
  useEffect(() => {
    if (!lidarrPushRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/lidarr/push");
        const data = await res.json();
        if (data.status === "idle") return;
        setLidarrPush(data);
        if (data.status === "complete" || data.status === "cancelled" || data.status === "error") {
          setLidarrPushRunning(false);
          fetchItems(); // Refresh to show updated statuses
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [lidarrPushRunning]);

  // Extract all unique playlist names for the dropdown
  const allPlaylistNames = useMemo(() => {
    const names = new Set<string>();
    for (const i of items) {
      if (i.type === "spotify_missing") {
        for (const n of i._plNames) names.add(n);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Build duplicate data
  const dupeData = useMemo(() => {
    const groups = new Map<string, EnrichedItem[]>();
    for (const item of items) {
      if (item.type !== "spotify_missing") continue;
      const key = `${(item.seedArtist || "").trim().toLowerCase()}::${(item.seedTitle || "").trim().toLowerCase()}`;
      let group = groups.get(key);
      if (!group) { group = []; groups.set(key, group); }
      group.push(item);
    }
    const dupeGroups = new Map<string, EnrichedItem[]>();
    const dupeIdSet = new Set<number>();
    let extraCount = 0;

    for (const [key, group] of groups) {
      if (group.length > 1) {
        dupeGroups.set(key, group);
        for (const item of group) dupeIdSet.add(item.id);
        extraCount += group.length - 1;
      }
    }

    return { dupeGroups, dupeIdSet, totalGroups: dupeGroups.size, extraCount };
  }, [items]);

  const deleteDuplicates = async () => {
    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(msg);
      setDupeProgress((p) => p ? { ...p, logs: [...logs] } : null);
    };

    addLog(`Found ${dupeData.totalGroups} groups with duplicate rows (${dupeData.extraCount} extras).`);

    const toDelete: number[] = [];
    const mergeUpdates: { id: number; mergedPlaylists: string }[] = [];

    for (const [key, group] of dupeData.dupeGroups) {
      const sorted = [...group].sort((a, b) => {
        const statusOrder: Record<string, number> = { pending: 0, completed: 1, downloading: 2, dismissed: 3 };
        const sa = statusOrder[a.status] ?? 4;
        const sb = statusOrder[b.status] ?? 4;
        if (sa !== sb) return sa - sb;
        return b._plNames.length - a._plNames.length;
      });

      const kept = sorted[0];
      const extras = sorted.slice(1);

      if (extras.length > 0) {
        const allPlaylists = new Set<string>();
        for (const item of group) {
          for (const n of item._plNames) allPlaylists.add(n);
        }
        const merged = JSON.stringify(Array.from(allPlaylists).sort());
        if (merged !== (kept.spotifyPlaylistNames || "[]")) {
          mergeUpdates.push({ id: kept.id, mergedPlaylists: merged });
        }

        const [artist, title] = key.split("::");
        addLog(`"${title}" by ${artist} — keeping id:${kept.id}, deleting ${extras.length} extra(s)`);
        for (const e of extras) toDelete.push(e.id);
      }
    }

    addLog(`${toDelete.length} duplicate rows to delete.`);

    if (toDelete.length === 0) {
      addLog("No duplicates to remove.");
      setDupeProgress({ active: false, total: 0, done: 0, logs: [...logs] });
      return;
    }

    setDupeProgress({ active: true, total: toDelete.length, done: 0, logs: [...logs] });

    if (mergeUpdates.length > 0) {
      addLog(`Merging playlist names on ${mergeUpdates.length} surviving rows...`);
      for (const upd of mergeUpdates) {
        try {
          await fetch("/api/wishlist", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: upd.id, playlistNames: upd.mergedPlaylists }),
          });
        } catch {}
      }
      addLog("Playlist names merged.");
    }

    const BATCH_SIZE = 200;
    let deleted = 0;
    let errors = 0;

    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = toDelete.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toDelete.length / BATCH_SIZE);

      addLog(`Batch ${batchNum}/${totalBatches}: deleting ${batch.length} rows...`);

      try {
        const res = await fetch("/api/wishlist", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          addLog(`ERROR: Batch ${batchNum} failed (${res.status}): ${errData.error || res.statusText}`);
          errors++;
        } else {
          deleted += batch.length;
          addLog(`Batch ${batchNum} done — ${deleted}/${toDelete.length} deleted.`);
        }
      } catch (err) {
        addLog(`ERROR: Batch ${batchNum} network error: ${err instanceof Error ? err.message : String(err)}`);
        errors++;
      }

      setDupeProgress((p) => p ? { ...p, done: deleted } : null);
    }

    const deleteSet = new Set(toDelete);
    const mergeMap = new Map(mergeUpdates.map((u) => [u.id, u.mergedPlaylists]));
    setRawItems((prev) =>
      prev
        .filter((i) => !deleteSet.has(i.id))
        .map((i) => mergeMap.has(i.id) ? { ...i, spotifyPlaylistNames: mergeMap.get(i.id)! } : i)
    );

    if (errors > 0) {
      addLog(`Completed with ${errors} error(s). ${deleted} of ${toDelete.length} deleted.`);
      setDupeProgress((p) => p ? { ...p, active: false, done: deleted, error: `${errors} batch(es) failed` } : null);
    } else {
      addLog(`Done! ${deleted} duplicates permanently deleted.`);
      setDupeProgress((p) => p ? { ...p, active: false, done: deleted } : null);
    }
  };

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => d === "asc" ? "desc" : "asc");
        return prev;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3" />;
  };

  const filteredAndSorted = useMemo(() => {
    let result = items.filter((i) => i.type === "spotify_missing");

    if (statusFilter !== "all") {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (duplicatesOnly) {
      result = result.filter((i) => dupeData.dupeIdSet.has(i.id));
    }

    if (playlistFilter !== "all") {
      result = result.filter((i) => i._plNames.includes(playlistFilter));
    }

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((i) => i._searchKey.includes(q));
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "title") cmp = (a.seedTitle || "").localeCompare(b.seedTitle || "");
      else if (sortField === "artist") cmp = (a.seedArtist || "").localeCompare(b.seedArtist || "");
      else if (sortField === "album") cmp = (a.seedAlbum || "").localeCompare(b.seedAlbum || "");
      else if (sortField === "status") cmp = a.status.localeCompare(b.status);
      else if (sortField === "popularity") cmp = (a.popularity || 0) - (b.popularity || 0);
      else if (sortField === "playlists") cmp = a._plNames.length - b._plNames.length;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, debouncedSearch, sortField, sortDir, statusFilter, duplicatesOnly, playlistFilter, dupeData]);

  const statusCounts = useMemo(() => {
    let all = 0, pending = 0, downloading = 0, completed = 0, dismissed = 0;
    for (const i of items) {
      if (i.type !== "spotify_missing") continue;
      all++;
      if (i.status === "pending") pending++;
      else if (i.status === "downloading") downloading++;
      else if (i.status === "completed") completed++;
      else if (i.status === "dismissed") dismissed++;
    }
    return { all, pending, downloading, completed, dismissed };
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

  // Virtualizer — only renders visible rows
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSorted.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

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
            <span className="opacity-60">({dupeData.extraCount})</span>
          </Button>
          {duplicatesOnly && dupeData.extraCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 text-red-400 border-red-400/30 hover:bg-red-400/10"
              onClick={deleteDuplicates}
              disabled={dupeProgress?.active}
            >
              {dupeProgress?.active ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Delete {dupeData.extraCount} Dupes
            </Button>
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

        {/* Push to Lidarr */}
        {lidarrConfigured && statusCounts.pending > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={startLidarrPush}
            disabled={lidarrPushRunning}
          >
            {lidarrPushRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Package className="h-3 w-3" />
            )}
            Push to Lidarr
            <span className="opacity-60">({statusCounts.pending})</span>
          </Button>
        )}

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
                    ? `Deleting duplicates... ${dupeProgress.done}/${dupeProgress.total}`
                    : dupeProgress.error
                      ? `Completed with errors`
                      : `Done — ${dupeProgress.done} duplicates deleted`}
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

      {/* Lidarr push progress panel */}
      {lidarrPush && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {lidarrPushRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : lidarrPush.status === "error" ? (
                  <X className="h-4 w-4 text-red-400" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                )}
                <span className="text-sm font-medium">
                  {lidarrPushRunning
                    ? `Pushing to Lidarr... ${lidarrPush.processed}/${lidarrPush.totalArtists} artists`
                    : lidarrPush.status === "error"
                      ? "Push failed"
                      : lidarrPush.status === "cancelled"
                        ? "Push cancelled"
                        : `Push complete — ${lidarrPush.added} artists added`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {lidarrPushRunning && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelLidarrPush}>
                    <Ban className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                )}
                {!lidarrPushRunning && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setLidarrPush(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            {lidarrPush.totalArtists > 0 && (
              <Progress
                value={lidarrPush.totalArtists > 0 ? (lidarrPush.processed / lidarrPush.totalArtists) * 100 : 0}
                className="h-1.5"
              />
            )}
            {lidarrPush.currentArtist && (
              <p className="text-xs text-muted-foreground truncate">
                {lidarrPush.currentArtist}
              </p>
            )}
            <div className="flex gap-3 text-xs">
              <span className="text-green-400">{lidarrPush.added} added</span>
              <span className="text-muted-foreground">{lidarrPush.skipped} already in Lidarr</span>
              <span className="text-blue-400">{lidarrPush.updatedItems} items updated</span>
              {lidarrPush.errors > 0 && (
                <span className="text-red-400">{lidarrPush.errors} errors</span>
              )}
            </div>
            {lidarrPush.errorMessage && (
              <p className="text-xs text-red-400">{lidarrPush.errorMessage}</p>
            )}
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
            {rawItems.length === 0 ? "No wishlist items yet" : "No items match your filter"}
          </p>
          {rawItems.length === 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Run a Spotify extraction from Settings to populate your wishlist
            </p>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Sticky header */}
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 w-12"></th>
                  <th className="px-2 py-3 w-[18%]">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort("title")}
                    >
                      Title <SortIcon field="title" />
                    </button>
                  </th>
                  <th className="px-2 py-3 w-[15%]">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort("artist")}
                    >
                      Artist <SortIcon field="artist" />
                    </button>
                  </th>
                  <th className="px-2 py-3 w-[15%]">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort("album")}
                    >
                      Album <SortIcon field="album" />
                    </button>
                  </th>
                  <th className="px-2 py-3 w-[16%]">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort("playlists")}
                    >
                      Playlists <SortIcon field="playlists" />
                    </button>
                  </th>
                  <th className="px-2 py-3 w-20">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort("popularity")}
                    >
                      Pop. <SortIcon field="popularity" />
                    </button>
                  </th>
                  <th className="px-2 py-3 w-20">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSort("status")}
                    >
                      Status <SortIcon field="status" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right w-24">Actions</th>
                </tr>
              </thead>
            </table>

            {/* Virtualized scrollable body */}
            <div
              ref={tableContainerRef}
              className="overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 420px)" }}
            >
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = filteredAndSorted[virtualRow.index] as EnrichedItem;
                  return (
                    <div
                      key={item.id}
                      className="absolute left-0 w-full border-b border-border/50 hover:bg-secondary/30 transition-colors group"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <table className="w-full text-sm table-fixed">
                        <tbody>
                          <tr>
                            <td className="px-4 py-1.5 w-12">
                              <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                                {item.coverUrl ? (
                                  <Image
                                    src={item.coverUrl}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="object-cover"
                                  />
                                ) : (
                                  <Music2 className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 w-[18%]">
                              <p className="font-medium truncate">{item.seedTitle || "Unknown"}</p>
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground w-[15%]">
                              <p className="truncate">{item.seedArtist || "Unknown"}</p>
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground w-[15%]">
                              <p className="truncate">{item.seedAlbum || ""}</p>
                            </td>
                            <td className="px-2 py-1.5 w-[16%]">
                              <div className="flex flex-wrap gap-1">
                                {item._plNames.slice(0, 2).map((name, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] truncate max-w-[120px]">
                                    {name}
                                  </Badge>
                                ))}
                                {item._plNames.length > 2 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    +{item._plNames.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 w-20">
                              {item.popularity != null ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-10 h-1.5 rounded-full bg-secondary overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${item.popularity}%`,
                                        backgroundColor: item.popularity >= 60 ? "#22c55e" : item.popularity >= 30 ? "#eab308" : "#6b7280",
                                      }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">{item.popularity}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 w-20">
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
                            <td className="px-4 py-1.5 w-24">
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
                                    title="Dismiss"
                                    onClick={() => dismissItem(item.id)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-400 hover:text-red-300"
                                  title="Delete permanently"
                                  onClick={() => deleteItem(item.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
