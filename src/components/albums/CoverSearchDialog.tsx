"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Check } from "lucide-react";

interface CoverResult {
  name: string;
  artist: string;
  artworkUrl: string;
  artworkUrlSmall: string;
}

interface CoverSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  album: string;
  albumArtist: string;
  onCoverUpdated: (coverPath: string) => void;
}

export function CoverSearchDialog({
  open,
  onOpenChange,
  album,
  albumArtist,
  onCoverUpdated,
}: CoverSearchDialogProps) {
  const [query, setQuery] = useState(`${albumArtist} ${album}`);
  const [results, setResults] = useState<CoverResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/albums/cover-search?query=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const applyCover = async (result: CoverResult, index: number) => {
    setApplying(index);
    try {
      const res = await fetch("/api/albums/cover-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          album,
          albumArtist,
          imageUrl: result.artworkUrl,
        }),
      });
      const data = await res.json();
      if (data.coverPath) {
        onCoverUpdated(data.coverPath);
        onOpenChange(false);
      }
    } catch {
      // Failed to apply
    }
    setApplying(null);
  };

  // Auto-search on open
  React.useEffect(() => {
    if (open && results.length === 0) {
      setQuery(`${albumArtist} ${album}`);
      search();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Find Cover Art</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search artist + album..."
          />
          <Button onClick={search} disabled={loading} size="icon">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {results.length > 0 ? (
          <div className="grid grid-cols-4 gap-3 mt-2">
            {results.map((r, i) => (
              <button
                key={i}
                className="relative group rounded-lg overflow-hidden border border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                onClick={() => applyCover(r, i)}
                disabled={applying !== null}
              >
                <img
                  src={r.artworkUrlSmall}
                  alt={r.name}
                  className="w-full aspect-square object-cover"
                />
                {applying === i && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Check className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                  <p className="text-[10px] text-white truncate font-medium">
                    {r.name}
                  </p>
                  <p className="text-[9px] text-white/70 truncate">{r.artist}</p>
                </div>
              </button>
            ))}
          </div>
        ) : !loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Search for album artwork using artist and album name
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
