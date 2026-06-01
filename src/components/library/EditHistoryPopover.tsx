"use client";

/**
 * Displays recent metadata edits for a single track. Read-only in v1 —
 * no revert button. Audit log entries fetched from
 * GET /api/tracks/[id]/edit-history.
 */
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, History } from "lucide-react";

interface EditEntry {
  id: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  editBatchId: string | null;
  editedAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackId: number;
  trackLabel?: string;
}

function timeAgo(iso: string): string {
  const then = new Date(iso + (iso.includes("Z") ? "" : "Z")).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(then).toLocaleDateString();
}

const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  album_artist: "Album artist",
  genre: "Genre",
  year: "Year",
};

export function EditHistoryPopover({
  open,
  onOpenChange,
  trackId,
  trackLabel,
}: Props) {
  const [edits, setEdits] = useState<EditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/tracks/${trackId}/edit-history`)
      .then((r) => r.json())
      .then((d) => setEdits(d.edits || []))
      .catch(() => setEdits([]))
      .finally(() => setLoading(false));
  }, [open, trackId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Edit history{trackLabel ? ` — ${trackLabel}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : edits.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No edits yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {edits.map((e) => (
              <div
                key={e.id}
                className="p-3 rounded-md border border-border bg-secondary/10 text-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium">
                    {FIELD_LABEL[e.fieldName] || e.fieldName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(e.editedAt)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="text-red-300">
                    &quot;{e.oldValue ?? "(empty)"}&quot;
                  </span>
                  {" → "}
                  <span className="text-green-300">
                    &quot;{e.newValue ?? "(empty)"}&quot;
                  </span>
                </div>
                {e.editBatchId && (
                  <div className="mt-1 text-[10px] text-muted-foreground/60">
                    Album-scope batch · {e.editBatchId.slice(0, 6)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
