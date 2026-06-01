"use client";

/**
 * Single-track metadata editor. Pre-fills six fields from the track and
 * PATCHes /api/tracks/[id]/metadata with only the fields that changed.
 *
 * Used from the album page's TrackActionsMenu when the manualEdit
 * feature flag is on.
 */
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, History } from "lucide-react";

interface TrackData {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string | null;
  genre?: string | null;
  year?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: TrackData;
  onSaved?: () => void;
  onOpenHistory?: () => void;
}

export function EditMetadataDialog({
  open,
  onOpenChange,
  track,
  onSaved,
  onOpenHistory,
}: Props) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [albumArtist, setAlbumArtist] = useState(track.albumArtist || "");
  const [genre, setGenre] = useState(track.genre || "");
  const [year, setYear] = useState<string>(
    track.year != null ? String(track.year) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when a new track flows in (re-open after closing)
  useEffect(() => {
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album);
    setAlbumArtist(track.albumArtist || "");
    setGenre(track.genre || "");
    setYear(track.year != null ? String(track.year) : "");
    setError(null);
  }, [track.id, track.title, track.artist, track.album, track.albumArtist, track.genre, track.year]);

  const save = async () => {
    setSaving(true);
    setError(null);

    // Build a body with ONLY fields whose value actually changed. Sending
    // unchanged fields would still be safe (the endpoint diffs server-side)
    // but smaller body = clearer audit log.
    const body: Record<string, string | number | null> = {};
    if (title !== track.title) body.title = title;
    if (artist !== track.artist) body.artist = artist;
    if (album !== track.album) body.album = album;
    if (albumArtist !== (track.albumArtist || "")) body.albumArtist = albumArtist;
    if (genre !== (track.genre || "")) body.genre = genre;
    const currentYear = track.year != null ? String(track.year) : "";
    if (year !== currentYear) {
      body.year = year === "" ? null : Number(year);
    }

    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/tracks/${track.id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Save failed: HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit track metadata</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Artist</Label>
            <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Album</Label>
              <Input value={album} onChange={(e) => setAlbum(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Album Artist</Label>
              <Input
                value={albumArtist}
                onChange={(e) => setAlbumArtist(e.target.value)}
                placeholder={track.artist}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Genre</Label>
              <Input value={genre} onChange={(e) => setGenre(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2020"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onOpenHistory?.();
            }}
            disabled={!onOpenHistory}
          >
            <History className="h-3.5 w-3.5 mr-1.5" />
            Edit history
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
