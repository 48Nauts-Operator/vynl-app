"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListMusic, Plus, Check, Loader2 } from "lucide-react";

interface PlaylistItem {
  id: number;
  name: string;
  trackCount: number;
}

interface AddToPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackIds: number[];
}

export function AddToPlaylistDialog({
  open,
  onOpenChange,
  trackIds,
}: AddToPlaylistDialogProps) {
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [addedTo, setAddedTo] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setAddedTo(null);
      setAdding(null);
      setCreating(false);
      setNewName("");
      return;
    }
    setLoading(true);
    fetch("/api/playlists")
      .then((r) => r.json())
      .then((data) => setPlaylists(data.playlists || []))
      .finally(() => setLoading(false));
  }, [open]);

  const addToPlaylist = async (playlistId: number) => {
    setAdding(playlistId);
    try {
      await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds }),
      });
      setAddedTo(playlistId);
      setTimeout(() => onOpenChange(false), 600);
    } catch {
      setAdding(null);
    }
  };

  const createAndAdd = async () => {
    if (!newName.trim()) return;
    setAdding(-1);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), trackIds }),
      });
      const created = await res.json();
      setAddedTo(created.id);
      setTimeout(() => onOpenChange(false), 600);
    } catch {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Add to Playlist
            <span className="text-muted-foreground font-normal text-sm ml-2">
              {trackIds.length} {trackIds.length === 1 ? "track" : "tracks"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Create new */}
        {!creating ? (
          <button
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors text-sm w-full text-left"
            onClick={() => setCreating(true)}
          >
            <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <span className="font-medium">Create New Playlist</span>
          </button>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Playlist name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              autoFocus
            />
            <Button
              size="sm"
              onClick={createAndAdd}
              disabled={!newName.trim() || adding !== null}
            >
              {adding === -1 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
          </div>
        )}

        <div className="border-t border-border" />

        {/* Playlist list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : playlists.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No playlists yet. Create one above.
          </p>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors text-sm w-full text-left disabled:opacity-50"
                  onClick={() => addToPlaylist(pl.id)}
                  disabled={adding !== null}
                >
                  <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center shrink-0">
                    {addedTo === pl.id ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : adding === pl.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <ListMusic className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{pl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pl.trackCount} {pl.trackCount === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                  {addedTo === pl.id && (
                    <Check className="h-4 w-4 text-green-500 ml-auto shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
