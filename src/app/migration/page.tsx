"use client";

/**
 * Spotify Migration Wizard.
 *
 * Three view states:
 *   - "loading"  — first paint while we check whether a snapshot exists
 *   - "syncing"  — sync job in flight (initial auto-sync or user-clicked re-sync)
 *   - "browse"   — the main table + playlist sidebar; user multi-selects + Migrates
 *   - "review"   — missing-items table after a Migrate click; per-row + batch
 *                  Add-to-Wishlist / Skip actions
 *
 * No Lidarr / spotDL in v1 by design — downloads happen from /wishlist using
 * the existing flow. See plan doc for rationale.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Music2,
  Heart,
  AlertTriangle,
  ListChecks,
  ArrowLeft,
} from "lucide-react";

interface Snapshot {
  snapshotId: number;
  syncedAt: string | null;
  playlistCount: number;
  trackCount: number;
  matchedCount: number;
  missingCount: number;
}

interface Playlist {
  id: number;
  spotifyId: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
  matchedCount: number;
  missingCount: number;
  isLiked: boolean;
}

interface Track {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  popularity: number | null;
  durationMs: number | null;
  isLikedSong: boolean;
  isMatched: boolean;
  matchConfidence: number | null;
  matchMethod: string | null;
  playlistNames: string[];
}

interface SyncStatus {
  status: string;
  phase?: string;
  phaseDetail?: string;
  totalPlaylists?: number;
  totalTracks?: number;
  totalLikedSongs?: number;
  matchedTracks?: number;
  unmatchedTracks?: number;
}

interface MissingTrack {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  popularity: number | null;
  matchConfidence: number | null;
  playlistNames: string[];
}

type View = "loading" | "syncing" | "browse" | "review" | "downloading";
type SortMode = "artist" | "title" | "album" | "popularity";

interface DownloadJob {
  status: "idle" | "running" | "complete" | "cancelled";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  alreadyHad: number;
  currentTrack?: string;
  results: Array<{
    spotifyTrackId: number;
    title: string;
    artist: string;
    outcome: "success" | "not_found" | "already_local";
    error?: string;
  }>;
  startedAt?: string;
  completedAt?: string;
}

export default function MigrationPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("loading");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksTotal, setTracksTotal] = useState(0);
  const [tracksLoading, setTracksLoading] = useState(false);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("artist");
  const [dedupe, setDedupe] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());

  const [review, setReview] = useState<{
    total: number;
    matched: number;
    missing: MissingTrack[];
    actioned: Set<number>; // ids that have been wishlisted or skipped
  } | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [downloadJob, setDownloadJob] = useState<DownloadJob | null>(null);

  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dlPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Initial load: check snapshot, decide what to render ─────────────

  const loadSnapshot = useCallback(async (): Promise<Snapshot | null> => {
    const res = await fetch("/api/spotify/migration/snapshot");
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
    return (await res.json()) as Snapshot;
  }, []);

  const loadPlaylists = useCallback(async () => {
    const res = await fetch("/api/spotify/migration/playlists");
    const data = await res.json();
    setPlaylists(data.playlists || []);
  }, []);

  const loadTracks = useCallback(async () => {
    setTracksLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedPlaylistId !== "all") params.set("playlistId", selectedPlaylistId);
      params.set("sort", sort);
      if (dedupe) params.set("dedupe", "1");
      params.set("limit", "2000");
      const res = await fetch(`/api/spotify/migration/tracks?${params.toString()}`);
      const data = await res.json();
      setTracks(data.tracks || []);
      setTracksTotal(data.total || 0);
    } finally {
      setTracksLoading(false);
    }
  }, [selectedPlaylistId, sort, dedupe]);

  // ── Sync ──────────────────────────────────────────────────────────────

  const startSync = useCallback(async () => {
    setView("syncing");
    setSyncStatus({ status: "running", phase: "starting", phaseDetail: "Starting sync..." });
    try {
      const res = await fetch("/api/spotify/migration/sync", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setBanner({ kind: "err", text: data.error || "Failed to start sync" });
        setView("browse");
        return;
      }
    } catch (err) {
      setBanner({ kind: "err", text: String(err) });
      setView("browse");
      return;
    }
    // Begin polling.
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    syncPollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/api/spotify/migration/sync");
        const s = (await r.json()) as SyncStatus;
        setSyncStatus(s);
        if (s.status === "complete" || s.status === "error" || s.status === "cancelled") {
          if (syncPollRef.current) clearInterval(syncPollRef.current);
          syncPollRef.current = null;
          if (s.status === "complete") {
            const snap = await loadSnapshot();
            setSnapshot(snap);
            await loadPlaylists();
            setView("browse");
          } else {
            setBanner({ kind: "err", text: `Sync ${s.status}` });
            setView("browse");
          }
        }
      } catch {
        // ignore poll errors; next tick may succeed
      }
    }, 2000);
  }, [loadSnapshot, loadPlaylists]);

  // First-time mount: check for an in-flight download FIRST (so navigating
  // away mid-download and coming back restores the live progress view).
  // Then check the snapshot + auto-sync if none.
  useEffect(() => {
    (async () => {
      try {
        // If a download job is running OR was running and the user hasn't
        // dismissed its result, snap straight to the downloading view.
        const dlRes = await fetch("/api/spotify/migration/download");
        const dlData = (await dlRes.json()) as DownloadJob;
        if (dlData.status === "running" || dlData.status === "complete" || dlData.status === "cancelled") {
          if (dlData.total > 0) {
            setDownloadJob(dlData);
            setView("downloading");
            if (dlData.status === "running") {
              if (dlPollRef.current) clearInterval(dlPollRef.current);
              dlPollRef.current = setInterval(async () => {
                try {
                  const r = await fetch("/api/spotify/migration/download");
                  const j = (await r.json()) as DownloadJob;
                  setDownloadJob(j);
                  if (j.status === "complete" || j.status === "cancelled") {
                    if (dlPollRef.current) clearInterval(dlPollRef.current);
                    dlPollRef.current = null;
                  }
                } catch {
                  // ignore
                }
              }, 1500);
            }
            return;
          }
        }

        const snap = await loadSnapshot();
        if (!snap) {
          await startSync();
          return;
        }
        setSnapshot(snap);
        await loadPlaylists();
        setView("browse");
      } catch (err) {
        setBanner({ kind: "err", text: String(err) });
        setView("browse");
      }
    })();
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      if (dlPollRef.current) clearInterval(dlPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload tracks whenever filters change.
  useEffect(() => {
    if (view !== "browse") return;
    loadTracks();
  }, [view, loadTracks]);

  // ── Banner auto-dismiss ────────────────────────────────────────────────

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  // ── Browse view interactions ──────────────────────────────────────────

  const selectPlaylist = (id: string) => {
    setSelectedPlaylistId(id);
    setSelectedTrackIds(new Set()); // clear cross-playlist selections on switch
  };

  const filteredTracks = useMemo(() => {
    if (!search.trim()) return tracks;
    const needle = search.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.artist.toLowerCase().includes(needle) ||
        (t.album || "").toLowerCase().includes(needle)
    );
  }, [tracks, search]);

  const toggleTrack = (id: number) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredTracks.map((t) => t.id);
    setSelectedTrackIds((prev) => {
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectAllInPlaylist = () => {
    // Convenience: select every track returned by the current filter.
    setSelectedTrackIds(new Set(filteredTracks.map((t) => t.id)));
  };

  const migrate = async () => {
    if (selectedTrackIds.size === 0) return;
    try {
      const res = await fetch("/api/spotify/migration/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: Array.from(selectedTrackIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data.error || "Migrate check failed" });
        return;
      }
      setReview({
        total: data.total,
        matched: data.matched,
        missing: data.missing,
        actioned: new Set(),
      });
      setView("review");
    } catch (err) {
      setBanner({ kind: "err", text: String(err) });
    }
  };

  // ── Review view interactions ──────────────────────────────────────────

  const addToWishlist = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/spotify/migration/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data.error || "Add to wishlist failed" });
        return;
      }
      setBanner({
        kind: "ok",
        text: `Added ${data.added} to wishlist${data.skipped ? ` (${data.skipped} already there)` : ""}`,
      });
      setReview((prev) =>
        prev
          ? { ...prev, actioned: new Set([...Array.from(prev.actioned), ...ids]) }
          : prev
      );
    } catch (err) {
      setBanner({ kind: "err", text: String(err) });
    }
  };

  const skip = (ids: number[]) => {
    if (ids.length === 0) return;
    setReview((prev) =>
      prev ? { ...prev, actioned: new Set([...Array.from(prev.actioned), ...ids]) } : prev
    );
    setBanner({ kind: "ok", text: `Skipped ${ids.length}` });
  };

  const downloadViaSpotdl = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/spotify/migration/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotifyTrackIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data?.error || "Download failed to start" });
        return;
      }
      setView("downloading");
      // Begin polling. Cancels any prior poll.
      if (dlPollRef.current) clearInterval(dlPollRef.current);
      dlPollRef.current = setInterval(async () => {
        try {
          const r = await fetch("/api/spotify/migration/download");
          const j = (await r.json()) as DownloadJob;
          setDownloadJob(j);
          if (j.status === "complete" || j.status === "cancelled") {
            if (dlPollRef.current) clearInterval(dlPollRef.current);
            dlPollRef.current = null;
          }
        } catch {
          // ignore transient poll errors
        }
      }, 1500);
    } catch (err) {
      setBanner({ kind: "err", text: String(err) });
    }
  };

  const cancelDownload = async () => {
    try {
      await fetch("/api/spotify/migration/download", { method: "DELETE" });
    } catch {}
  };

  const finishDownload = () => {
    if (dlPollRef.current) {
      clearInterval(dlPollRef.current);
      dlPollRef.current = null;
    }
    setDownloadJob(null);
    setReview(null);
    setSelectedTrackIds(new Set());
    setView("browse");
  };

  const finishReview = () => {
    setReview(null);
    setSelectedTrackIds(new Set());
    setView("browse");
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (view === "loading") {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (view === "syncing") {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold">Syncing from Spotify</h1>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium">
                  {syncStatus?.phase
                    ? syncStatus.phase.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
                    : "Working..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {syncStatus?.phaseDetail || "Reading your Spotify library..."}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 text-center">
              <Stat label="Playlists" value={syncStatus?.totalPlaylists ?? 0} />
              <Stat label="Tracks" value={syncStatus?.totalTracks ?? 0} />
              <Stat label="Matched" value={syncStatus?.matchedTracks ?? 0} />
            </div>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Reads playlists, liked songs, and matches against your local library.
              <br />
              Nothing is mirrored or added to your wishlist automatically — that&apos;s your call.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "downloading") {
    const j = downloadJob;
    const done = j?.status === "complete" || j?.status === "cancelled";
    const pct = j && j.total > 0 ? Math.round((j.processed / j.total) * 100) : 0;
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold">
          {done ? "Migration complete" : "Downloading via spotDL"}
        </h1>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  {done
                    ? j?.status === "cancelled"
                      ? "Cancelled"
                      : "Done — your library has been updated"
                    : j?.currentTrack || "Starting..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {j ? `${j.processed} / ${j.total} processed` : ""}
                </p>
              </div>
            </div>

            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              <Stat label="Downloaded" value={j?.succeeded ?? 0} />
              <Stat label="Already local" value={j?.alreadyHad ?? 0} />
              <Stat label="Not found" value={j?.failed ?? 0} />
              <Stat label="Total" value={j?.total ?? 0} />
            </div>

            {j && j.results.length > 0 && (
              <div className="rounded-md border border-border max-h-[40vh] overflow-y-auto divide-y divide-border">
                {j.results
                  .slice()
                  .reverse()
                  .slice(0, 200)
                  .map((r) => (
                    <div
                      key={`${r.spotifyTrackId}-${r.outcome}`}
                      className="px-3 py-1.5 flex items-center gap-2 text-sm"
                    >
                      {r.outcome === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : r.outcome === "already_local" ? (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-amber-400 shrink-0" />
                      )}
                      <span className="flex-1 truncate">
                        <span className="font-medium">{r.title}</span>
                        <span className="text-muted-foreground"> — {r.artist}</span>
                      </span>
                      <span
                        className={`text-xs shrink-0 ${
                          r.outcome === "not_found"
                            ? "text-amber-400"
                            : r.outcome === "already_local"
                              ? "text-muted-foreground"
                              : "text-emerald-400"
                        }`}
                      >
                        {r.outcome === "success"
                          ? "downloaded"
                          : r.outcome === "already_local"
                            ? "already local"
                            : "not found"}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {!done && (
                <Button variant="outline" onClick={cancelDownload}>
                  Cancel
                </Button>
              )}
              {done && (
                <>
                  <Button onClick={finishDownload}>Back to wizard</Button>
                  {j && j.failed > 0 && (
                    <Button variant="outline" onClick={() => router.push("/wishlist?status=not_found")}>
                      View Not Found ({j.failed})
                    </Button>
                  )}
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Successful downloads land in <code className="text-foreground">MUSIC_LIBRARY_PATH</code>;
              the file watcher imports them to beets &amp; Vynl. Not-found tracks are pushed to
              your wishlist with status &ldquo;not_found&rdquo; so you can try a different source later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "review" && review) {
    const remaining = review.missing.filter((m) => !review.actioned.has(m.id));
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={finishReview} className="mb-1">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to browse
            </Button>
            <h1 className="text-3xl font-bold">Missing from your library</h1>
            <p className="text-muted-foreground mt-1">
              {review.matched} of {review.total} are already local. {review.missing.length} are
              missing — review and decide.
            </p>
          </div>
          {remaining.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => downloadViaSpotdl(remaining.map((r) => r.id))}
                disabled={remaining.length === 0}
              >
                <Loader2 className="h-4 w-4 mr-2" />
                Download {remaining.length} via spotDL
              </Button>
              <Button
                variant="outline"
                onClick={() => addToWishlist(remaining.map((r) => r.id))}
                disabled={remaining.length === 0}
              >
                <ListChecks className="h-4 w-4 mr-2" />
                Just wishlist (no download)
              </Button>
              <Button variant="ghost" onClick={() => skip(remaining.map((r) => r.id))}>
                Skip all
              </Button>
            </div>
          )}
        </div>

        {banner && <BannerBar banner={banner} />}

        {remaining.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-400" />
              <h2 className="text-xl font-semibold">All done</h2>
              <p className="text-muted-foreground">
                Every missing track has been actioned. Open /wishlist to download what you sent
                there.
              </p>
              <div className="flex gap-2 justify-center pt-2">
                <Button onClick={() => router.push("/wishlist")}>Open Wishlist</Button>
                <Button variant="outline" onClick={finishReview}>
                  Back to browse
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {remaining.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.artist} {m.album ? `· ${m.album}` : ""}
                    </p>
                    {m.playlistNames.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-1">
                        {m.playlistNames.slice(0, 3).map((p) => (
                          <Badge key={p} variant="outline" className="text-[10px]">
                            {p}
                          </Badge>
                        ))}
                        {m.playlistNames.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{m.playlistNames.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {m.matchConfidence != null && (
                    <Badge variant="outline" className="text-xs shrink-0" title="Fuzzy match below threshold">
                      <AlertTriangle className="h-3 w-3 mr-1 text-amber-400" />
                      low match
                    </Badge>
                  )}
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => downloadViaSpotdl([m.id])}
                      title="Download via spotDL — file lands in your library"
                    >
                      <Loader2 className="h-3.5 w-3.5 mr-1.5" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addToWishlist([m.id])}
                      title="Add to wishlist without downloading"
                    >
                      <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                      Wishlist
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => skip([m.id])}>
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Skip
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // view === "browse"
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Spotify Migration</h1>
          <p className="text-muted-foreground mt-1">
            {snapshot
              ? `${snapshot.trackCount} tracks across ${snapshot.playlistCount} playlists · ${snapshot.matchedCount} already local, ${snapshot.missingCount} missing`
              : "Loading..."}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {snapshot?.syncedAt && (
            <span className="text-xs text-muted-foreground">
              Synced {formatRelative(snapshot.syncedAt)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={startSync}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Re-sync from Spotify
          </Button>
        </div>
      </div>

      {banner && <BannerBar banner={banner} />}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        {/* Playlist sidebar */}
        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="p-2 space-y-0.5 max-h-[70vh] overflow-y-auto">
            <PlaylistButton
              active={selectedPlaylistId === "all"}
              onClick={() => selectPlaylist("all")}
              icon={<Music2 className="h-4 w-4" />}
              label="All tracks"
              count={snapshot?.trackCount ?? 0}
              missing={snapshot?.missingCount ?? 0}
            />
            {playlists.map((p) => (
              <PlaylistButton
                key={`${p.id}-${p.spotifyId}`}
                active={selectedPlaylistId === (p.isLiked ? "liked" : String(p.id))}
                onClick={() => selectPlaylist(p.isLiked ? "liked" : String(p.id))}
                icon={p.isLiked ? <Heart className="h-4 w-4 text-pink-400" /> : <Music2 className="h-4 w-4" />}
                label={p.name}
                count={p.trackCount}
                missing={p.missingCount}
              />
            ))}
          </CardContent>
        </Card>

        {/* Tracks table */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by title / artist / album..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="artist">Artist</option>
                <option value="title">Title</option>
                <option value="album">Album</option>
                <option value="popularity">Popularity</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={dedupe}
                  onChange={(e) => setDedupe(e.target.checked)}
                />
                Dedupe
              </label>
              <Button variant="outline" size="sm" onClick={selectAllInPlaylist}>
                Select all visible
              </Button>
              <Button
                onClick={migrate}
                disabled={selectedTrackIds.size === 0}
                size="sm"
              >
                Migrate {selectedTrackIds.size > 0 ? `${selectedTrackIds.size} ` : ""}selected
              </Button>
            </div>

            {tracksLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTracks.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No tracks match the current filter.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded-md max-h-[65vh] overflow-y-auto">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/30 text-xs text-muted-foreground sticky top-0">
                  <input
                    type="checkbox"
                    checked={
                      filteredTracks.length > 0 &&
                      filteredTracks.every((t) => selectedTrackIds.has(t.id))
                    }
                    onChange={toggleAllVisible}
                  />
                  <span className="flex-1">
                    {filteredTracks.length} of {tracksTotal} {dedupe ? "(deduped)" : ""}
                  </span>
                </div>
                {filteredTracks.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 px-3 py-1.5 hover:bg-secondary/30 ${
                      selectedTrackIds.has(t.id) ? "bg-secondary/40" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTrackIds.has(t.id)}
                      onChange={() => toggleTrack(t.id)}
                    />
                    {t.isMatched ? (
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-emerald-400 shrink-0"
                        aria-label="already local"
                      />
                    ) : (
                      <XCircle
                        className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0"
                        aria-label="missing"
                      />
                    )}
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr_1fr_1fr] gap-2 text-sm">
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="truncate text-muted-foreground">{t.artist}</span>
                      <span className="truncate text-muted-foreground">{t.album || ""}</span>
                    </div>
                    {t.playlistNames.length > 0 && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {t.playlistNames.length === 1
                          ? t.playlistNames[0]
                          : `${t.playlistNames.length} pls`}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function PlaylistButton({
  active,
  onClick,
  icon,
  label,
  count,
  missing,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  missing: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition ${
        active ? "bg-primary/15 text-primary" : "hover:bg-secondary/50"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {count}
        {missing > 0 && (
          <span className="text-amber-400 ml-1" title={`${missing} missing locally`}>
            ·{missing}
          </span>
        )}
      </span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-secondary/40 py-2 px-1">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function BannerBar({ banner }: { banner: { kind: "ok" | "err"; text: string } }) {
  return (
    <div
      className={`text-sm rounded-md px-3 py-2 ${
        banner.kind === "ok"
          ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
          : "bg-red-500/10 text-red-500 dark:text-red-400"
      }`}
    >
      {banner.text}
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return d.toLocaleDateString();
}
