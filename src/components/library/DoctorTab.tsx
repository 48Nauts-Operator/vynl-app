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
  Trash2,
  Tag,
  HelpCircle,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  junk: <Trash2 className="h-3.5 w-3.5" />,
  "wrong-genre": <Tag className="h-3.5 w-3.5" />,
};

export function DoctorTab() {
  const [job, setJob] = useState<DoctorJob | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [logOffset, setLogOffset] = useState(0);

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [actingOnId, setActingOnId] = useState<number | null>(null);
  // Most recent accept/dismiss error, surfaced as an inline banner so
  // failures aren't silent (previously: button click → nothing visible).
  const [actError, setActError] = useState<string | null>(null);
  // Per-attempt result tracker for bulkAct, so we can show "23 of 28
  // succeeded, 5 failed — first error: <message>" instead of a silent refresh.
  const [bulkResult, setBulkResult] = useState<{
    succeeded: number;
    failed: number;
    firstError: string | null;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  // Plan mode = scan + LLM + queue, NO beets writes. Default ON in dev
  // environments to keep local testing safe (the beets DB on Mac is
  // typically a network mount of the same file Prod uses).
  const [planOnly, setPlanOnly] = useState(
    process.env.NODE_ENV !== "production"
  );

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

  // On mount: check if a beets-doctor job is already running (e.g. user
  // navigated away and came back). If so, replay the existing log buffer
  // and resume polling.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/library/housekeeping/job?since=0", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.action !== "beets-doctor") return;
        if (data.status === "running") {
          setLogs(data.logs || []);
          setLogOffset(data.totalLogs ?? (data.logs || []).length);
          setJob({
            status: data.status,
            total: data.total,
            current: data.current,
            result: data.result,
          });
          setRunning(true);
        } else if (data.status === "complete" && data.logs?.length) {
          // Show the last completed scan's output as a record
          setLogs(data.logs);
          setLogOffset(data.totalLogs ?? data.logs.length);
          setJob({
            status: data.status,
            total: data.total,
            current: data.current,
            result: data.result,
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the housekeeping job + the review queue while running. The
  // queue poll runs at a slower cadence (every 3 ticks) so we don't
  // hammer the DB during long scans.
  useEffect(() => {
    if (!running) return;
    let currentOffset = logOffset;
    let tick = 0;
    const interval = setInterval(async () => {
      tick++;
      try {
        const res = await fetch(`/api/library/housekeeping/job?since=${currentOffset}`);
        const data = await res.json();
        if (data.action && data.action !== "beets-doctor") {
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
        /* ignore poll errors */
      }
      // Refresh the review queue periodically so the badge ticks up
      // live while findings are inserted.
      if (tick % 4 === 0) {
        loadReviews();
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
        body: JSON.stringify({ action: "beets-doctor", planOnly }),
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
    setActError(null);
    try {
      const res = await fetch(`/api/beetsai/review/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setActError(`Review #${id} ${action} failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
        console.error("review act failed", { id, action, status: res.status, body });
      }
      await loadReviews();
    } catch (err) {
      setActError(`Review #${id} ${action} threw: ${String(err)}`);
      console.error("review act threw", err);
    } finally {
      setActingOnId(null);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(reviews.map((r) => r.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkAct = async (action: "accept" | "dismiss") => {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    setActError(null);
    setBulkResult(null);
    const ids = Array.from(selectedIds);
    let succeeded = 0;
    let failed = 0;
    let firstError: string | null = null;
    try {
      // Issue in parallel; collect per-response results so we can show
      // the user a real summary instead of a silent list refresh.
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/beetsai/review/${id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });
            if (!res.ok) {
              const body = await res.text().catch(() => "");
              return { id, ok: false, error: `HTTP ${res.status} — ${body.slice(0, 160)}` };
            }
            return { id, ok: true, error: null as string | null };
          } catch (err) {
            return { id, ok: false, error: String(err).slice(0, 160) };
          }
        })
      );
      for (const r of results) {
        if (r.ok) succeeded++;
        else {
          failed++;
          if (!firstError) firstError = `#${r.id}: ${r.error}`;
        }
      }
      setBulkResult({ succeeded, failed, firstError });
      setSelectedIds(new Set());
      await loadReviews();
    } finally {
      setBulkActing(false);
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="What does BeetsAI Doctor do?"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96 text-xs leading-relaxed space-y-3" side="bottom" align="start">
                    <div>
                      <p className="font-semibold text-sm mb-1">What is BeetsAI Doctor?</p>
                      <p className="text-muted-foreground">
                        A full-library cleanup assistant. Scans for four
                        classes of metadata problems, applies the obvious
                        fixes automatically, and queues anything uncertain
                        for your review.
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold mb-1">What it looks for</p>
                      <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                        <li>
                          <b>Compilations</b> — albums with many distinct
                          artists not yet flagged as Various Artists.
                        </li>
                        <li>
                          <b>Disc splits</b> — multi-disc albums stored as
                          separate entries that should be merged.
                        </li>
                        <li>
                          <b>Junk entries</b> — orphan rows with broken
                          metadata (blank albums, URLs as album names).
                        </li>
                        <li>
                          <b>Wrong / missing genres</b> — empty or clearly
                          mismatched genre tags.
                        </li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold mb-1">How fixes apply</p>
                      <p className="text-muted-foreground">
                        Every fix updates three layers atomically: the
                        beets DB, the file tags via <code>beet write</code>,
                        and Vynl&apos;s own tracks table so the UI shows the
                        change immediately. Every action is logged for audit.
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold mb-1">Plan mode</p>
                      <p className="text-muted-foreground">
                        Recommended for the first run. Detects + judges
                        candidates but writes nothing — everything queues
                        for review so you can eyeball what Doctor wants
                        to do before approving it.
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Scans the entire library, sends each problem to the configured LLM, auto-applies fixes the model is 100% confident in, queues the rest for review. Logged to the BeetsAI actions table.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={planOnly}
                  onChange={(e) => setPlanOnly(e.target.checked)}
                  disabled={running}
                  className="cursor-pointer"
                />
                <span>Plan only (no writes)</span>
              </label>
              {!running ? (
                <Button onClick={startScan}>
                  <Play className="h-4 w-4 mr-2" />
                  {planOnly ? "Run Plan Scan" : "Run Full Scan"}
                </Button>
              ) : (
                <Button variant="outline" onClick={cancel}>
                  Cancel
                </Button>
              )}
            </div>
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
          {/* Surface accept/dismiss failures so the user isn't left wondering
              why nothing happened. Previously these were silent. */}
          {actError && (
            <div className="mb-3 p-2 rounded-md border border-red-500/40 bg-red-500/5 text-xs font-mono break-words">
              <div className="flex items-start justify-between gap-2">
                <span className="text-red-300">{actError}</span>
                <button
                  type="button"
                  onClick={() => setActError(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="dismiss error"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {bulkResult && (bulkResult.succeeded > 0 || bulkResult.failed > 0) && (
            <div
              className={
                "mb-3 p-2 rounded-md border text-xs " +
                (bulkResult.failed === 0
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-200")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div>
                    Bulk action: <b>{bulkResult.succeeded}</b> succeeded ·{" "}
                    <b>{bulkResult.failed}</b> failed
                  </div>
                  {bulkResult.firstError && (
                    <div className="font-mono mt-1 break-words">
                      first error → {bulkResult.firstError}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBulkResult(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items waiting for review. Run a scan and the LLM will queue anything it&apos;s not 100% sure about.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Bulk action bar */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <button
                  type="button"
                  onClick={
                    selectedIds.size === reviews.length
                      ? clearSelection
                      : selectAllVisible
                  }
                  className="underline-offset-2 hover:underline text-muted-foreground"
                >
                  {selectedIds.size === reviews.length ? "Clear all" : `Select all ${reviews.length}`}
                </button>
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span>{selectedIds.size} selected</span>
                    <Button
                      size="sm"
                      onClick={() => bulkAct("accept")}
                      disabled={bulkActing}
                    >
                      {bulkActing ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      )}
                      Approve {selectedIds.size}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkAct("dismiss")}
                      disabled={bulkActing}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Dismiss {selectedIds.size}
                    </Button>
                  </>
                )}
              </div>

              {Object.entries(grouped).map(([issueType, items]) => {
                const groupIds = items.map((i) => i.id);
                const allSelected = groupIds.every((id) => selectedIds.has(id));
                return (
                <div key={issueType}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      {ISSUE_ICONS[issueType]} {issueType} ({items.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (allSelected) groupIds.forEach((id) => next.delete(id));
                          else groupIds.forEach((id) => next.add(id));
                          return next;
                        })
                      }
                      className="text-[10px] underline-offset-2 hover:underline text-muted-foreground"
                    >
                      {allSelected ? "Deselect group" : "Select group"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {items.map((r) => (
                      <div
                        key={r.id}
                        className={`border border-border rounded-md p-3 text-sm ${selectedIds.has(r.id) ? "bg-accent/40" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelected(r.id)}
                            className="mt-1 cursor-pointer"
                          />
                          <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
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
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
