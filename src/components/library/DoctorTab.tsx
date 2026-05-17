"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Stethoscope,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  Disc,
  Users,
  RefreshCw,
} from "lucide-react";

interface DoctorJob {
  id?: string;
  action?: string;
  status?: "idle" | "running" | "complete" | "error" | "cancelled";
  total?: number;
  current?: number;
  logs?: string[];
  totalLogs?: number;
  result?: { scanId?: string; scanned?: number; autoApplied?: number; queued?: number; errors?: number };
}

interface ReviewItem {
  id: number;
  scanId: string;
  issueType: string;
  albumName: string;
  albumArtist: string | null;
  context: Record<string, unknown> | null;
  proposedCommand: string;
  proposedArgs: string[] | null;
  confidence: number | null;
  llmModel: string | null;
  reasoning: string | null;
  status: string;
  createdAt: string;
}

const ISSUE_ICONS: Record<string, React.ReactNode> = {
  compilation: <Users className="h-3.5 w-3.5" />,
  "disc-split": <Disc className="h-3.5 w-3.5" />,
};

export function DoctorTab() {
  const [job, setJob] = useState<DoctorJob | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logOffset, setLogOffset] = useState(0);

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [actingOnId, setActingOnId] = useState<number | null>(null);

  const logEndRef = React.useRef<HTMLDivElement | null>(null);

  const loadReviews = useCallback(async () => {
    setReviewLoading(true);
    try {
      const res = await fetch("/api/beetsai/review?status=pending", { cache: "no-store" });
      const data = await res.json();
      setReviews(data.items || []);
    } finally {
      setReviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Poll the housekeeping job when running
  useEffect(() => {
    if (!running) return;
    let currentOffset = logOffset;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/library/housekeeping/job?since=${currentOffset}`);
        const data = await res.json();
        if (data.action && data.action !== "beets-doctor") {
          // Some other job is running — ignore
          return;
        }
        if (data.logs && data.logs.length > 0) {
          setLogs((prev) => [...prev, ...data.logs]);
          currentOffset = data.totalLogs;
          setLogOffset(data.totalLogs);
        }
        setJob({
          status: data.status,
          total: data.total,
          current: data.current,
          result: data.result,
        });
        if (data.status === "complete" || data.status === "error" || data.status === "cancelled") {
          setRunning(false);
          loadReviews();
        }
      } catch {
        // ignore poll errors
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [running, loadReviews, logOffset]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const startScan = async () => {
    setLogs([]);
    setLogOffset(0);
    setJob({ status: "running", current: 0, total: 0 });
    setRunning(true);
    try {
      const res = await fetch("/api/library/housekeeping/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "beets-doctor" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLogs([`✗ Could not start scan: ${data.error || res.statusText}`]);
        setRunning(false);
      }
    } catch (err) {
      setLogs([`✗ ${err}`]);
      setRunning(false);
    }
  };

  const cancel = async () => {
    await fetch("/api/library/housekeeping/job", { method: "DELETE" });
  };

  const act = async (id: number, action: "accept" | "dismiss") => {
    setActingOnId(id);
    try {
      await fetch(`/api/beetsai/review/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await loadReviews();
    } finally {
      setActingOnId(null);
    }
  };

  // Group reviews by issue type
  const grouped = reviews.reduce(
    (acc, r) => {
      (acc[r.issueType] = acc[r.issueType] || []).push(r);
      return acc;
    },
    {} as Record<string, ReviewItem[]>
  );

  return (
    <div className="space-y-6">
      {/* Scan controls */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                BeetsAI Doctor
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Scans the entire library, sends each problem to the configured LLM, auto-applies fixes the model is 100% confident in, queues the rest for review. Logged to the BeetsAI actions table.
              </p>
            </div>
            {!running ? (
              <Button onClick={startScan}>
                <Play className="h-4 w-4 mr-2" />
                Run Full Scan
              </Button>
            ) : (
              <Button variant="outline" onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {job?.status === "complete" && job.result && (
            <div className="mb-3 p-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>
                Scanned <b>{job.result.scanned}</b> · auto-applied{" "}
                <b>{job.result.autoApplied}</b> · queued{" "}
                <b>{job.result.queued}</b> · errors{" "}
                <b>{job.result.errors}</b>
              </span>
            </div>
          )}
          {running && job?.total !== undefined && job?.current !== undefined && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>
                {job.current} / {job.total}
              </span>
            </div>
          )}
          {logs.length > 0 && (
            <div className="rounded-md border border-border bg-black/40 p-3 text-xs font-mono max-h-80 overflow-y-auto">
              {logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              Review Queue
              {reviews.length > 0 && (
                <Badge variant="secondary">{reviews.length}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={loadReviews} disabled={reviewLoading}>
              {reviewLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items waiting for review. Run a scan and the LLM will queue anything it's not 100% sure about.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([issueType, items]) => (
                <div key={issueType}>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                    {ISSUE_ICONS[issueType]} {issueType} ({items.length})
                  </h4>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <div
                        key={r.id}
                        className="border border-border rounded-md p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{r.albumName}</p>
                            {r.albumArtist && (
                              <p className="text-xs text-muted-foreground truncate">
                                {r.albumArtist}
                              </p>
                            )}
                            {r.reasoning && (
                              <p className="text-xs mt-1 text-muted-foreground italic">
                                &ldquo;{r.reasoning}&rdquo;
                              </p>
                            )}
                            <code className="block text-[10px] text-muted-foreground mt-1 truncate">
                              {r.proposedCommand}
                            </code>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge
                              variant="outline"
                              className="text-[10px] tabular-nums"
                              title={`LLM confidence: ${r.confidence}`}
                            >
                              {r.confidence !== null
                                ? `${Math.round(r.confidence * 100)}%`
                                : "?"}
                            </Badge>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actingOnId === r.id}
                                onClick={() => act(r.id, "dismiss")}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                disabled={actingOnId === r.id}
                                onClick={() => act(r.id, "accept")}
                              >
                                {actingOnId === r.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
