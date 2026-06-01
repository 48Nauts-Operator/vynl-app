"use client";

/**
 * Album-scope metadata editor. Updates album / albumArtist / genre / year
 * across EVERY track in the album. PATCHes /api/albums/[id]/metadata.
 *
 * Used from the album page's hero 3-dot menu when manualEdit is on.
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
import { Loader2, Save, AlertTriangle } from "lucide-react";

interface AlbumData {
  album: string;
  albumArtist?: string | null;
  year?: number | null;
  genre?: string | null;
  trackCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  album: AlbumData;
  /** Album id in the <albumArtist>---<album> URL format */
  albumId: string;
  onSaved?: (result: { updated: number; edits: number }) => void;
}

export function EditAlbumMetadataDialog({
  open,
  onOpenChange,
  album,
  albumId,
  onSaved,
}: Props) {
  const [albumName, setAlbumName] = useState(album.album);
  const [albumArtist, setAlbumArtist] = useState(album.albumArtist || "");
  const [genre, setGenre] = useState(album.genre || "");
  const [year, setYear] = useState<string>(
    album.year != null ? String(album.year) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlbumName(album.album);
    setAlbumArtist(album.albumArtist || "");
    setGenre(album.genre || "");
    setYear(album.year != null ? String(album.year) : "");
    setError(null);
  }, [album.album, album.albumArtist, album.year, album.genre]);

  const save = async () => {
    setSaving(true);
    setError(null);

    const body: Record<string, string | number | null> = {};
    if (albumName !== album.album) body.album = albumName;
    if (albumArtist !== (album.albumArtist || "")) body.albumArtist = albumArtist;
    if (genre !== (album.genre || "")) body.genre = genre;
    const currentYear = album.year != null ? String(album.year) : "";
    if (year !== currentYear) body.year = year === "" ? null : Number(year);

    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/albums/${albumId}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Save failed: HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      onSaved?.({ updated: data.updated || 0, edits: data.edits || 0 });
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
          <DialogTitle>Edit album metadata</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground flex gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0" />
            <span>
              These changes apply to all <strong>{album.trackCount}</strong> tracks
              in this album. Edits are logged but cannot be reverted in v1.
            </span>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Album name</Label>
            <Input value={albumName} onChange={(e) => setAlbumName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Album artist</Label>
            <Input
              value={albumArtist}
              onChange={(e) => setAlbumArtist(e.target.value)}
              placeholder="Same as track artist if left blank"
            />
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

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
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
      </DialogContent>
    </Dialog>
  );
}
