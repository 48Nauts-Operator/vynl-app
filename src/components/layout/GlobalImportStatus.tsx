"use client";

import React, { useEffect, useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Ban,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useRouter } from "next/navigation";

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

interface ImportStatus {
  jobId: string;
  status: "running" | "complete" | "cancelled" | "error" | "idle";
  total: number;
  current: number;
  currentFolder: string;
  postProcessing: boolean;
  succeeded: number;
  failed: number;
  folderElapsed?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export function GlobalImportStatus() {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/library/import/batch?since=0");
        const data = await res.json();
        if (data.status && data.status !== "idle") {
          setStatus(data);
          // Reset dismissed state if a new job appears
          if (dismissed && data.jobId !== dismissed) {
            setDismissed(null);
          }
        } else {
          setStatus(null);
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    poll(); // Initial check
    pollRef.current = setInterval(poll, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [dismissed]);

  // Auto-dismiss completed jobs after 20 seconds
  useEffect(() => {
    if (
      status &&
      (status.status === "complete" ||
        status.status === "cancelled" ||
        status.status === "error")
    ) {
      const timer = setTimeout(() => {
        setDismissed(status.jobId);
      }, 20000);
      return () => clearTimeout(timer);
    }
  }, [status?.status, status?.jobId]);

  // Nothing to show
  if (!status || status.status === "idle") return null;
  // User dismissed this job's notification
  if (dismissed === status.jobId) return null;

  const isRunning = status.status === "running";
  const isDone = status.status === "complete";
  const isCancelled = status.status === "cancelled";
  const isError = status.status === "error";
  const progress =
    status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;
  const totalElapsed = status.startedAt ? Date.now() - status.startedAt : 0;

  const handleCancel = async () => {
    try {
      await fetch("/api/library/import/batch", { method: "DELETE" });
    } catch {
      // Best effort
    }
  };

  const goToImport = () => {
    router.push("/library?tab=import");
  };

  return (
    <div
      style={{ position: "fixed", bottom: "5rem", right: "1rem", zIndex: 9999 }}
      className="w-80 bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
          )}
          {isDone && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          )}
          {isCancelled && (
            <Ban className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          )}
          {isError && (
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">
            {isRunning
              ? status.postProcessing
                ? "Post-processing..."
                : "Importing music..."
              : isDone
              ? "Import complete"
              : isCancelled
              ? "Import cancelled"
              : "Import failed"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {!isRunning && (
            <button
              onClick={() => setDismissed(status.jobId)}
              className="p-1 hover:bg-secondary rounded transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="px-3 py-2 space-y-1.5">
          <Progress value={progress} className="h-1.5" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span className="truncate max-w-[60%]">
              {status.postProcessing
                ? "Syncing library..."
                : status.currentFolder}
            </span>
            <span className="shrink-0">
              {status.current}/{status.total} &middot; {progress}%
            </span>
          </div>
        </div>
      )}

      {/* Summary (done states) */}
      {!isRunning && (
        <div className="px-3 py-2">
          <div className="flex gap-3 text-xs">
            <span>
              <span className="text-green-400 font-medium">
                {status.succeeded}
              </span>{" "}
              <span className="text-muted-foreground">succeeded</span>
            </span>
            {status.failed > 0 && (
              <span>
                <span className="text-red-400 font-medium">
                  {status.failed}
                </span>{" "}
                <span className="text-muted-foreground">failed</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 py-2 border-t border-border space-y-2">
          {isRunning && status.folderElapsed !== undefined && (
            <div className="text-xs text-muted-foreground">
              Current folder: {formatElapsed(status.folderElapsed)}
            </div>
          )}
          {totalElapsed > 0 && (
            <div className="text-xs text-muted-foreground">
              Total time:{" "}
              {formatElapsed(
                status.completedAt
                  ? status.completedAt - status.startedAt!
                  : totalElapsed
              )}
            </div>
          )}
          {isError && status.error && (
            <div className="text-xs text-red-400 truncate">{status.error}</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-secondary/10">
        <button
          onClick={goToImport}
          className="text-xs text-primary hover:underline"
        >
          View details
        </button>
        {isRunning && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30"
          >
            <Ban className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
