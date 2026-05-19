"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoreVertical, Search, Mic, Loader2, CheckCircle, XCircle } from "lucide-react";

interface TrackActionsMenuProps {
  trackId: number;
  /** Title + artist for the dialog header. */
  trackLabel: string;
  /** Called after a successful apply so the caller can refetch. */
  onApplied?: () => void;
}

interface IdentifyMatch {
  score: number;
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  recordingId: string | null;
  releaseId: string | null;
  source: string;
}

interface CurrentMeta {
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  year: number | null;
}

/**
 * Per-track 3-dot menu. Currently surfaces the two identification
 * actions (Look up metadata via MusicBrainz, Identify by audio via
 * Chromaprint + AcoustID). Each opens a dialog showing candidate
 * matches with an Apply button per row.
 *
 * Audio mode requires `fpcalc` in the container (libchromaprint-tools).
 * If it's missing, the dialog shows the error from the backend.
 */
export function TrackActionsMenu({ trackId, trackLabel, onApplied }: TrackActionsMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"name" | "audio">("name");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentMeta | null>(null);
  const [candidates, setCandidates] = useState<IdentifyMatch[]>([]);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);

  const runIdentify = async (m: "name" | "audio") => {
    setMode(m);
    setDialogOpen(true);
    setLoading(true);
    setError(null);
    setCandidates([]);
    setAppliedIdx(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: m }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCurrent(data.current);
      setCandidates(data.candidates || []);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  };

  const applyMatch = async (idx: number) => {
    setApplyingIdx(idx);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/apply-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match: candidates[idx] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAppliedIdx(idx);
      onApplied?.();
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setApplyingIdx(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => e.stopPropagation()}
            aria-label="Track actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => runIdentify("name")}>
            <Search className="h-4 w-4 mr-2" />
            Look up metadata
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runIdentify("audio")}>
            <Mic className="h-4 w-4 mr-2" />
            Identify (audio)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "audio" ? "Identify (audio)" : "Look up metadata"}{" "}
              <span className="text-muted-foreground font-normal text-sm">
                — {trackLabel}
              </span>
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "audio"
                ? "Fingerprinting + querying AcoustID…"
                : "Searching MusicBrainz…"}
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-300 font-mono break-words">
              {error}
            </div>
          )}

          {!loading && !error && candidates.length === 0 && current && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No matches found.
            </div>
          )}

          {!loading && current && candidates.length > 0 && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-muted-foreground">
                Current: <span className="text-foreground">{current.title}</span> ·{" "}
                {current.artist} · {current.album || "(no album)"}
                {current.year ? ` · ${current.year}` : ""}
              </p>
              {candidates.map((c, i) => {
                const diff: string[] = [];
                if (c.title && c.title !== current.title) diff.push("title");
                if (c.artist && c.artist !== current.artist) diff.push("artist");
                if (c.album && c.album !== current.album) diff.push("album");
                if (c.year && c.year !== current.year) diff.push("year");
                return (
                  <div
                    key={`${c.recordingId || c.title}-${i}`}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.artist} · {c.album || "(no album)"}
                          {c.year ? ` · ${c.year}` : ""}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] uppercase tracking-wider">
                          <span className="text-[#a855f7]">
                            {(c.score * 100).toFixed(0)}% match
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">
                            {c.source}
                          </span>
                          {diff.length > 0 && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-amber-300">
                                changes: {diff.join(", ")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {appliedIdx === i ? (
                        <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-1" />
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={applyingIdx !== null}
                          onClick={() => applyMatch(i)}
                        >
                          {applyingIdx === i ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Apply"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {appliedIdx !== null && (
            <div className="text-xs text-emerald-300 flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" />
              Applied. Refresh to see the new metadata.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export { Search as IdentifyByNameIcon, Mic as IdentifyByAudioIcon };
// re-export for parent components that want to render the menu trigger
// alongside other per-row actions instead of using the bundled one.
export { XCircle as IdentifyErrorIcon };
