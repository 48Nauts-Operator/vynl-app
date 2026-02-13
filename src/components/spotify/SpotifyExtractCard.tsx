"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  CheckCircle,
  Ban,
  RefreshCw,
  ExternalLink,
  Music2,
  ListMusic,
  Heart,
  Disc3,
  Download,
  ChevronDown,
} from "lucide-react";

interface SpotifyStatus {
  connected: boolean;
  userId?: string;
  displayName?: string;
}

interface ExtractStatus {
  status: "idle" | "running" | "complete" | "error" | "cancelled";
  phase?: string;
  phaseDetail?: string;
  totalPlaylists?: number;
  totalTracks?: number;
  totalLikedSongs?: number;
  matchedTracks?: number;
  unmatchedTracks?: number;
  processedTracks?: number;
  error?: string;
}

const PHASE_LABELS: Record<string, string> = {
  playlists: "Fetching Playlists",
  playlist_tracks: "Fetching Playlist Tracks",
  liked_songs: "Fetching Liked Songs",
  audio_features: "Fetching Audio Features",
  matching: "Matching Against Library",
  mirroring: "Creating Vynl Playlists",
  wishlist: "Populating Wishlist",
  complete: "Complete",
};

const PHASE_ORDER = ["playlists", "playlist_tracks", "liked_songs", "audio_features", "matching", "mirroring", "wishlist", "complete"];

export default function SpotifyExtractCard() {
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus | null>(null);
  const [extractStatus, setExtractStatus] = useState<ExtractStatus | null>(null);
  const [extractRunning, setExtractRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load status on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/spotify/status").then((r) => r.json()),
      fetch("/api/spotify/extract").then((r) => r.json()),
    ]).then(([status, extract]) => {
      setSpotifyStatus(status);
      setExtractStatus(extract);
      if (extract.status === "running") setExtractRunning(true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Poll extraction status
  useEffect(() => {
    if (!extractRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/spotify/extract");
        const data = await res.json();
        setExtractStatus(data);
        if (data.status !== "running") {
          setExtractRunning(false);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [extractRunning]);

  // Check URL params for Spotify OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyParam = params.get("spotify");
    if (spotifyParam === "connected") {
      fetch("/api/spotify/status").then((r) => r.json()).then(setSpotifyStatus);
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("spotify");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/spotify/auth";
  };

  const handleDisconnect = async () => {
    await fetch("/api/spotify/status", { method: "DELETE" });
    setSpotifyStatus({ connected: false });
    setExtractStatus(null);
  };

  const handleStartExtract = async () => {
    setExtractRunning(true);
    try {
      await fetch("/api/spotify/extract", { method: "POST" });
    } catch {}
  };

  const handleCancelExtract = async () => {
    await fetch("/api/spotify/extract", { method: "DELETE" });
  };

  const phaseProgress = () => {
    if (!extractStatus?.phase) return 0;
    const idx = PHASE_ORDER.indexOf(extractStatus.phase);
    if (idx === -1) return 0;
    return Math.round(((idx + 1) / PHASE_ORDER.length) * 100);
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#1DB954]" aria-hidden>
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Spotify Data Extract
          {spotifyStatus?.connected && (
            <Badge variant="secondary" className="ml-auto text-xs">
              Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Not connected */}
        {!spotifyStatus?.connected && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Spotify account to extract your playlists, liked songs, and audio features.
              Matched tracks become Vynl playlists. Unmatched tracks go to your wishlist.
            </p>
            <Button onClick={handleConnect}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Connect Spotify
            </Button>
          </div>
        )}

        {/* Connected — show user info + actions */}
        {spotifyStatus?.connected && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm">
                Connected as <span className="font-medium">{spotifyStatus.displayName || spotifyStatus.userId}</span>
              </p>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>

            {/* Extraction running */}
            {extractStatus?.status === "running" && (
              <div className="space-y-3 p-3 rounded-lg border border-border bg-secondary/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#1DB954]" />
                    <span className="text-sm font-medium">
                      {PHASE_LABELS[extractStatus.phase || ""] || extractStatus.phase}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCancelExtract}>
                    <Ban className="h-3.5 w-3.5 mr-1" />
                    Cancel
                  </Button>
                </div>

                <Progress value={phaseProgress()} className="h-1.5" />

                {extractStatus.phaseDetail && (
                  <p className="text-xs text-muted-foreground truncate">{extractStatus.phaseDetail}</p>
                )}

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-1.5 rounded bg-secondary/20">
                    <p className="text-sm font-bold">{extractStatus.totalPlaylists || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Playlists</p>
                  </div>
                  <div className="p-1.5 rounded bg-secondary/20">
                    <p className="text-sm font-bold">{extractStatus.totalTracks || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Tracks</p>
                  </div>
                  <div className="p-1.5 rounded bg-secondary/20">
                    <p className="text-sm font-bold text-green-400">{extractStatus.matchedTracks || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Matched</p>
                  </div>
                  <div className="p-1.5 rounded bg-secondary/20">
                    <p className="text-sm font-bold text-orange-400">{extractStatus.unmatchedTracks || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Missing</p>
                  </div>
                </div>
              </div>
            )}

            {/* Extraction complete */}
            {extractStatus?.status === "complete" && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                  <div className="flex items-center gap-2 text-sm mb-3">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Extraction complete</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2 rounded bg-secondary/20">
                      <ListMusic className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold">{extractStatus.totalPlaylists || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Playlists</p>
                    </div>
                    <div className="p-2 rounded bg-secondary/20">
                      <Music2 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold">{extractStatus.totalTracks || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div className="p-2 rounded bg-secondary/20">
                      <Disc3 className="h-4 w-4 mx-auto mb-1 text-green-400" />
                      <p className="text-lg font-bold text-green-400">{extractStatus.matchedTracks || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Matched</p>
                    </div>
                    <div className="p-2 rounded bg-secondary/20">
                      <Download className="h-4 w-4 mx-auto mb-1 text-orange-400" />
                      <p className="text-lg font-bold text-orange-400">{extractStatus.unmatchedTracks || 0}</p>
                      <p className="text-[10px] text-muted-foreground">Wishlist</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleStartExtract}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-Extract
                  </Button>
                </div>
              </div>
            )}

            {/* Error state */}
            {extractStatus?.status === "error" && (
              <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5">
                <p className="text-sm text-red-400">
                  Extraction failed: {extractStatus.error || "Unknown error"}
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={handleStartExtract}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            )}

            {/* Idle — not yet extracted */}
            {(extractStatus?.status === "idle" || !extractStatus) && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Extract your Spotify library to match against your local collection.
                  Playlists with matched tracks become Vynl playlists. Missing tracks go to your wishlist for download.
                </p>
                <Button onClick={handleStartExtract}>
                  <Music2 className="h-4 w-4 mr-2" />
                  Start Extraction
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
