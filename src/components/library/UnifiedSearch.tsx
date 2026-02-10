"use client";

import React, { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePlayerStore, Track } from "@/store/player";
import {
  Search,
  Play,
  Music,
  Radio,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  source: "local" | "spotify" | "youtube" | "radio";
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  coverPath?: string;
  trackId?: number;
  filePath?: string;
  spotifyUri?: string;
  youtubeId?: string;
  streamUrl?: string;
}

const SOURCE_COLORS: Record<string, string> = {
  local: "bg-gray-500",
  spotify: "bg-green-500",
  youtube: "bg-red-500",
  radio: "bg-purple-500",
};

export function UnifiedSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);
  const { setTrack } = usePlayerStore();

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/library/search?q=${encodeURIComponent(q)}&sources=local,spotify,radio`
      );
      const data = await res.json();
      setResults(data.results || []);
      setOpen(true);
    } catch {}
    setSearching(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const playResult = (result: SearchResult) => {
    const track: Track = {
      id: result.trackId || 0,
      title: result.title,
      artist: result.artist,
      album: result.album || "",
      duration: result.duration || 0,
      filePath: result.filePath,
      coverPath: result.coverPath,
      source: result.source,
      sourceId: result.spotifyUri || result.youtubeId,
      streamUrl: result.streamUrl,
    };
    setTrack(track);
    setOpen(false);
  };

  const grouped = {
    local: results.filter((r) => r.source === "local"),
    spotify: results.filter((r) => r.source === "spotify"),
    youtube: results.filter((r) => r.source === "youtube"),
    radio: results.filter((r) => r.source === "radio"),
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search all sources..."
          className="pl-9 pr-9"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {query && !searching && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {open && results.length > 0 && (
        <Card className="absolute top-full mt-2 left-0 right-0 z-50 shadow-xl">
          <ScrollArea className="max-h-[400px]">
            <CardContent className="p-2">
              {(
                Object.entries(grouped) as [
                  string,
                  SearchResult[],
                ][]
              ).map(
                ([source, items]) =>
                  items.length > 0 && (
                    <div key={source} className="mb-2">
                      <div className="flex items-center gap-2 px-2 py-1">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full",
                            SOURCE_COLORS[source]
                          )}
                        />
                        <span className="text-xs font-medium uppercase text-muted-foreground">
                          {source}
                        </span>
                      </div>
                      {items.map((item, i) => (
                        <div
                          key={`${source}-${i}`}
                          className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-secondary/50 cursor-pointer"
                          onClick={() => playResult(item)}
                        >
                          <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0">
                            {source === "radio" ? (
                              <Radio className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Music className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{item.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.artist}
                            </p>
                          </div>
                          <Play className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </div>
                      ))}
                    </div>
                  )
              )}
            </CardContent>
          </ScrollArea>
        </Card>
      )}

      {/* Click outside to close */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
