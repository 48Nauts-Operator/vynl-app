"use client";

/**
 * Settings → Spotify card.
 *
 * Replaces the old SpotifyExtractCard. Two modes:
 *
 *   Not connected → single "Connect Spotify" button (kicks the OAuth flow)
 *   Connected     → status (display name + last sync time) + link to the
 *                   Migration Wizard at /migration + "Disconnect & Wipe"
 *                   button that purges every Spotify-derived row.
 *
 * No "Start extracting" surface — the old 7-phase pipeline that auto-
 * mirrored playlists and auto-populated the wishlist is gone. Users
 * explicitly drive imports from /migration now.
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, LinkIcon, Trash2, AlertTriangle, ListChecks } from "lucide-react";

interface SpotifyStatus {
  connected: boolean;
  userId?: string;
  displayName?: string;
}

interface SnapshotInfo {
  syncedAt: string | null;
  trackCount: number;
  playlistCount: number;
  matchedCount: number;
  missingCount: number;
}

export default function SpotifyMigrationCard() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [wiping, setWiping] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, snapRes] = await Promise.all([
        fetch("/api/spotify/status"),
        fetch("/api/spotify/migration/snapshot"),
      ]);
      const statusData = (await statusRes.json()) as SpotifyStatus;
      setStatus(statusData);
      if (snapRes.ok) {
        setSnapshot((await snapRes.json()) as SnapshotInfo);
      } else {
        setSnapshot(null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Pick up post-OAuth state when the callback bounces us back here.
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify") === "connected") {
      const url = new URL(window.location.href);
      url.searchParams.delete("spotify");
      window.history.replaceState({}, "", url.toString());
      setBanner({ kind: "ok", text: "Connected to Spotify." });
    }
  }, [load]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const handleConnect = () => {
    window.location.href = "/api/spotify/auth";
  };

  const handleWipe = async () => {
    setWiping(true);
    try {
      const res = await fetch("/api/spotify", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ kind: "err", text: data?.error || "Wipe failed" });
        return;
      }
      setBanner({
        kind: "ok",
        text: `Disconnected. Wiped ${data?.counts?.snapshots || 0} snapshot(s), ${
          data?.counts?.wishlistMissing || 0
        } wishlist rows.`,
      });
      setWipeOpen(false);
      await load();
    } catch (err) {
      setBanner({ kind: "err", text: String(err) });
    } finally {
      setWiping(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#1DB954]" aria-hidden>
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Spotify
          {status?.connected && (
            <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">
              Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {banner && (
          <div
            className={`text-sm rounded-md px-3 py-2 ${
              banner.kind === "ok"
                ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
                : "bg-red-500/10 text-red-500 dark:text-red-400"
            }`}
          >
            {banner.text}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : !status?.connected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Vynl uses Spotify as a one-shot migration tunnel: read what you have,
              cross-check against your local library, and put the missing items on
              your wishlist. Nothing is mirrored automatically.
            </p>
            <Button onClick={handleConnect}>
              <LinkIcon className="h-4 w-4 mr-2" />
              Connect Spotify
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connected as <strong>{status.displayName || status.userId}</strong>
              {snapshot?.syncedAt && (
                <>
                  {" "}
                  · last synced {formatRelative(snapshot.syncedAt)} ·{" "}
                  {snapshot.trackCount} tracks ({snapshot.missingCount} missing locally)
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/migration">
                <Button>
                  <ListChecks className="h-4 w-4 mr-2" />
                  Open Migration Wizard
                </Button>
              </Link>
              <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Disconnect & Wipe
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                      Disconnect Spotify and wipe all Spotify state?
                    </DialogTitle>
                    <DialogDescription>
                      This removes the OAuth tokens, every Spotify snapshot (playlists +
                      tracks + matches), and any wishlist rows created from Spotify
                      imports. Your local library and other wishlist items are untouched.
                      This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setWipeOpen(false)} disabled={wiping}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleWipe} disabled={wiping}>
                      {wiping ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Yes, wipe everything
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
