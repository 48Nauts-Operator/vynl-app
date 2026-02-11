"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlayerStore, Track as PlayerTrack } from "@/store/player";
import { Track as DBTrack } from "@/lib/db/schema";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  Play,
  Music,
  RefreshCw,
  Grid3X3,
  List,
  Loader2,
  Disc3,
  User,
  FolderInput,
  Copy,
  Wrench,
  Trash2,
  FileCheck,
  ImageIcon,
  CheckCircle2,
  XCircle,
  Circle,
  FolderUp,
} from "lucide-react";
import Image from "next/image";
import { motion } from "framer-motion";
import { formatDuration, formatFileSize } from "@/lib/utils";

function dbToPlayerTrack(t: DBTrack): PlayerTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    filePath: t.filePath,
    coverPath: t.coverPath || undefined,
    source: "local",
  };
}

// Strip ANSI escape codes from beet output
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\[[\d;]*m/g, "");
}

// ---- Import Tab ----
interface BatchFolderResult {
  folder: string;
  success: boolean;
  tracks?: number;
  error?: string;
}

function ImportTab() {
  const [importPath, setImportPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Batch import state
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCurrent, setBatchCurrent] = useState(0);
  const [batchCurrentFolder, setBatchCurrentFolder] = useState("");
  const [batchResults, setBatchResults] = useState<BatchFolderResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);
  const [batchPostProcessing, setBatchPostProcessing] = useState(false);

  const handleImport = async () => {
    if (!importPath.trim()) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/library/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: importPath.trim() }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setImporting(false);
    }
  };

  // Poll for batch import status
  useEffect(() => {
    if (!batchImporting) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/library/import/batch");
        const data = await res.json();
        if (data.status === "idle") return;

        setBatchTotal(data.total || 0);
        setBatchCurrent(data.current || 0);
        setBatchCurrentFolder(data.currentFolder || "");
        setBatchResults(data.results || []);
        setBatchPostProcessing(data.postProcessing || false);

        if (data.status === "complete") {
          setBatchSummary({
            total: data.total,
            succeeded: data.succeeded,
            failed: data.failed,
          });
          setBatchImporting(false);
        } else if (data.status === "error") {
          setResult({ error: data.error || "Import failed" });
          setBatchImporting(false);
        }
      } catch {
        // Poll error, will retry
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [batchImporting]);

  // On mount, check if an import is already running
  useEffect(() => {
    fetch("/api/library/import/batch")
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "running") {
          setBatchImporting(true);
          setBatchTotal(data.total || 0);
          setBatchCurrent(data.current || 0);
          setBatchCurrentFolder(data.currentFolder || "");
          setBatchResults(data.results || []);
          setBatchPostProcessing(data.postProcessing || false);
        }
      })
      .catch(() => {});
  }, []);

  const handleBatchImport = async () => {
    if (!importPath.trim()) return;
    setBatchImporting(true);
    setBatchResults([]);
    setBatchSummary(null);
    setBatchCurrent(0);
    setBatchTotal(0);
    setBatchPostProcessing(false);

    try {
      const res = await fetch("/api/library/import/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: importPath.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ error: data.error || "Batch import failed" });
        setBatchImporting(false);
        return;
      }

      setBatchTotal(data.total || 0);
      // Polling takes over from here
    } catch (err) {
      setResult({ error: String(err) });
      setBatchImporting(false);
    }
  };

  // Combine and clean output for display
  const getDisplayOutput = () => {
    if (!result || result.error) return null;
    const parts: string[] = [];
    if (result.output) parts.push(stripAnsi(result.output));
    if (result.warnings) parts.push(stripAnsi(result.warnings));
    return parts.filter(Boolean).join("\n").trim();
  };

  const displayOutput = result ? getDisplayOutput() : null;
  const hasNewTracks = result?.scan && result.scan.scanned > 0;
  const wasRetried = result?.retried;
  const isRunning = importing || batchImporting;
  const batchProgress = batchTotal > 0 ? Math.round((batchCurrent / batchTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Single Folder Import */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-1">Import Music</h3>
            <p className="text-sm text-muted-foreground">
              Import a folder into your library using Beets. Files will be auto-tagged and organized.
            </p>
          </div>
          <div className="flex gap-3">
            <Input
              placeholder="/path/to/music/folder"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleImport} disabled={isRunning || !importPath.trim()}>
              {importing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderInput className="h-4 w-4 mr-2" />
              )}
              {importing ? "Importing..." : "Import"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleBatchImport}
              disabled={isRunning || !importPath.trim()}
            >
              {batchImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FolderUp className="h-4 w-4 mr-2" />
              )}
              {batchImporting ? "Batch..." : "Batch Import"}
            </Button>
          </div>

          {/* Single import result */}
          {result && !batchImporting && !batchSummary && (
            <Card className="bg-secondary/30">
              <CardContent className="p-4 text-sm space-y-3">
                {result.error ? (
                  <div>
                    <p className="text-red-400 font-medium">Import failed</p>
                    <pre className="text-xs text-red-300/70 whitespace-pre-wrap mt-1">
                      {result.error}
                      {result.details && `\n${result.details}`}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={hasNewTracks ? "default" : "secondary"} className="text-xs">
                        {hasNewTracks ? "Import complete" : "No new tracks imported"}
                      </Badge>
                      {wasRetried && (
                        <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">
                          Auto-tag failed — imported with existing tags
                        </Badge>
                      )}
                    </div>
                    {result.scan && (
                      <div className="flex gap-4 text-xs">
                        <span>
                          <span className="text-muted-foreground">Scanned:</span>{" "}
                          <span className="font-medium">{result.scan.scanned}</span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">Added:</span>{" "}
                          <span className="font-medium">{result.scan.added}</span>
                        </span>
                        {result.scan.errors > 0 && (
                          <span>
                            <span className="text-red-400">Errors:</span>{" "}
                            <span className="font-medium text-red-400">{result.scan.errors}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {displayOutput && (
                      <details className="group">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                          Show beet output
                        </summary>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto mt-2 p-3 rounded bg-black/30 font-mono leading-relaxed">
                          {displayOutput}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Batch Import Progress */}
      {(batchImporting || batchSummary) && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Batch Import</h3>
              {batchImporting && (
                <Badge variant="outline" className="text-xs">
                  {batchPostProcessing
                    ? "Post-processing..."
                    : `Importing ${batchCurrent}/${batchTotal} folders`}
                </Badge>
              )}
              {batchSummary && !batchImporting && (
                <Badge variant="default" className="text-xs">Complete</Badge>
              )}
            </div>

            {/* Progress bar */}
            {batchImporting && batchTotal > 0 && (
              <div className="space-y-1">
                <Progress value={batchProgress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{batchCurrentFolder}</span>
                  <span>{batchProgress}%</span>
                </div>
              </div>
            )}

            {/* Folder results list */}
            {batchResults.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {batchResults.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-1 text-sm"
                  >
                    {r.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <span className={r.success ? "" : "text-muted-foreground"}>
                      {r.folder}
                    </span>
                    {r.tracks && (
                      <span className="text-xs text-muted-foreground">
                        ({r.tracks} tracks)
                      </span>
                    )}
                    {r.error && (
                      <span className="text-xs text-red-400 truncate">
                        — {r.error}
                      </span>
                    )}
                  </div>
                ))}
                {/* Currently importing indicator */}
                {batchImporting && !batchPostProcessing && batchCurrentFolder && (
                  <div className="flex items-center gap-2 py-1 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    <span className="text-muted-foreground">{batchCurrentFolder}...</span>
                  </div>
                )}
                {/* Remaining folders */}
                {batchImporting && batchTotal > batchCurrent && (
                  <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                    <Circle className="h-4 w-4 shrink-0" />
                    <span>Remaining: {batchTotal - batchCurrent} folders</span>
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            {batchSummary && (
              <div className="flex gap-4 text-sm pt-2 border-t border-border">
                <span>
                  <span className="text-green-400 font-medium">{batchSummary.succeeded}</span>{" "}
                  <span className="text-muted-foreground">succeeded</span>
                </span>
                {batchSummary.failed > 0 && (
                  <span>
                    <span className="text-red-400 font-medium">{batchSummary.failed}</span>{" "}
                    <span className="text-muted-foreground">failed</span>
                  </span>
                )}
                <span className="text-muted-foreground">
                  {batchSummary.total} total
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Duplicates Tab ----
function DuplicatesTab() {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeResult, setRemoveResult] = useState<any>(null);

  const analyze = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/library/duplicates");
      setAnalysis(await res.json());
    } catch (err) {
      setAnalysis({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const removeDuplicates = async (dryRun: boolean) => {
    setRemoving(true);
    setRemoveResult(null);
    try {
      const res = await fetch(`/api/library/duplicates?dryRun=${dryRun}`, {
        method: "DELETE",
      });
      const data = await res.json();
      setRemoveResult(data);
      if (!dryRun) analyze(); // Refresh after actual removal
    } catch (err) {
      setRemoveResult({ error: String(err) });
    } finally {
      setRemoving(false);
    }
  };

  const qualityBadge = (format: string, quality: number) => {
    const colors: Record<number, string> = {
      5: "bg-green-500/20 text-green-400",
      4: "bg-emerald-500/20 text-emerald-400",
      3: "bg-yellow-500/20 text-yellow-400",
      2: "bg-orange-500/20 text-orange-400",
      1: "bg-red-500/20 text-red-400",
      0: "bg-gray-500/20 text-gray-400",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[quality] || colors[0]}`}
      >
        {format}
      </span>
    );
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-1">Duplicate Detection</h3>
            <p className="text-sm text-muted-foreground">
              Find and remove duplicate tracks, keeping the highest quality version.
            </p>
          </div>
          <Button onClick={analyze} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {loading ? "Analyzing..." : "Scan for Duplicates"}
          </Button>
        </div>

        {analysis && !analysis.error && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card className="bg-secondary/30">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{analysis.duplicateSets?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Duplicate Sets</p>
                </CardContent>
              </Card>
              <Card className="bg-secondary/30">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{analysis.totalDuplicateFiles || 0}</p>
                  <p className="text-xs text-muted-foreground">Extra Files</p>
                </CardContent>
              </Card>
              <Card className="bg-secondary/30">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">
                    {formatFileSize(analysis.wastedSpaceBytes || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Wasted Space</p>
                </CardContent>
              </Card>
            </div>

            {analysis.formatDistribution &&
              Object.keys(analysis.formatDistribution).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Formats:</span>
                  {Object.entries(analysis.formatDistribution).map(
                    ([fmt, count]) => (
                      <Badge key={fmt} variant="secondary">
                        {fmt}: {count as number}
                      </Badge>
                    )
                  )}
                </div>
              )}

            {analysis.duplicateSets?.length > 0 && (
              <div className="space-y-2">
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {analysis.duplicateSets.slice(0, 50).map((dup: any) => (
                    <div
                      key={dup.key}
                      className="p-3 rounded bg-secondary/20 border border-border"
                    >
                      <p className="text-sm font-medium">
                        {dup.artist} — {dup.title}
                      </p>
                      <p className="text-xs text-muted-foreground mb-1">
                        {dup.album}
                      </p>
                      <div className="flex gap-2">
                        {dup.copies.map((c: any, i: number) => (
                          <div
                            key={c.id}
                            className={`text-xs ${i === 0 ? "font-bold" : "text-muted-foreground"}`}
                          >
                            {qualityBadge(c.format, c.quality)}
                            <span className="ml-1">
                              {formatFileSize(c.fileSize)}
                            </span>
                            {i === 0 && (
                              <span className="ml-1 text-green-400">
                                (keep)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {analysis.duplicateSets.length > 50 && (
                    <p className="text-sm text-muted-foreground text-center">
                      ...and {analysis.duplicateSets.length - 50} more
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => removeDuplicates(true)}
                    disabled={removing}
                  >
                    {removing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileCheck className="h-4 w-4 mr-2" />
                    )}
                    Dry Run
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => removeDuplicates(false)}
                    disabled={removing}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove Lower Quality
                  </Button>
                </div>
              </div>
            )}

            {removeResult && (
              <Card className="bg-secondary/30">
                <CardContent className="p-4 text-sm">
                  {removeResult.error ? (
                    <p className="text-red-400">{removeResult.error}</p>
                  ) : (
                    <div>
                      <p>
                        {removeResult.dryRun ? "[DRY RUN] Would remove" : "Removed"}{" "}
                        {removeResult.filesRemoved} files (
                        {formatFileSize(removeResult.spaceFreedBytes)})
                      </p>
                      {removeResult.errors?.length > 0 && (
                        <p className="text-red-400 mt-1">
                          {removeResult.errors.length} errors
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Housekeeping Tab ----
function HousekeepingTab() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any>>({});

  const runAction = async (action: string) => {
    setRunning(action);
    try {
      const res = await fetch("/api/library/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [action]: data }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [action]: { error: String(err) } }));
    } finally {
      setRunning(null);
    }
  };

  const actions = [
    {
      id: "clean-missing",
      label: "Clean Missing Files",
      desc: "Remove database entries for files that no longer exist on disk.",
      icon: Trash2,
    },
    {
      id: "refresh-metadata",
      label: "Refresh Metadata",
      desc: "Re-read tags from all audio files and update the database.",
      icon: RefreshCw,
    },
    {
      id: "fetch-artwork",
      label: "Fetch Artwork",
      desc: "Download missing album art using Beets (requires Beets).",
      icon: ImageIcon,
    },
  ];

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">Housekeeping</h3>
          <p className="text-sm text-muted-foreground">
            Maintain your library by cleaning up stale entries and refreshing metadata.
          </p>
        </div>
        <div className="grid gap-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/10"
            >
              <div className="flex items-center gap-3">
                <action.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {results[action.id] && (
                  <span className="text-xs text-muted-foreground">
                    {results[action.id].error
                      ? "Error"
                      : results[action.id].message}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAction(action.id)}
                  disabled={running !== null}
                >
                  {running === action.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Run"
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Main Library Page ----
export default function LibraryPage() {
  const [tracks, setTracks] = useState<DBTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [view, setView] = useState<"tracks" | "albums" | "artists">("tracks");
  const [mainTab, setMainTab] = useState("browse");
  const { setQueue } = usePlayerStore();

  const fetchTracks = useCallback(async () => {
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      limit: "50",
    });
    const res = await fetch(`/api/library?${params}`);
    const data = await res.json();
    setTracks(data.tracks || []);
    setTotal(data.total || 0);
  }, [search, page]);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/library/scan", { method: "POST" });
      const data = await res.json();
      setScanResult(
        `Scanned ${data.scanned} files, added ${data.added} tracks (${data.adapter} adapter)`
      );
      fetchTracks();
    } catch (err) {
      setScanResult("Scan failed: " + String(err));
    } finally {
      setScanning(false);
    }
  };

  const playTrack = (track: DBTrack, index: number) => {
    const playerTracks = tracks.map(dbToPlayerTrack);
    setQueue(playerTracks, index);
  };

  // Group tracks by album
  const albums = React.useMemo(() => {
    const map = new Map<string, DBTrack[]>();
    for (const t of tracks) {
      const key = `${t.album}|||${t.artist}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([key, tracks]) => ({
      name: key.split("|||")[0],
      artist: key.split("|||")[1],
      coverPath: tracks[0].coverPath,
      tracks,
    }));
  }, [tracks]);

  // Group tracks by artist
  const artists = React.useMemo(() => {
    const map = new Map<string, DBTrack[]>();
    for (const t of tracks) {
      if (!map.has(t.artist)) map.set(t.artist, []);
      map.get(t.artist)!.push(t);
    }
    return Array.from(map.entries()).map(([name, tracks]) => ({
      name,
      trackCount: tracks.length,
      coverPath: tracks[0].coverPath,
    }));
  }, [tracks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Library</h1>
          <p className="text-muted-foreground mt-1">{total} tracks</p>
        </div>
        <Button onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {scanning ? "Scanning..." : "Scan Library"}
        </Button>
      </div>

      {scanResult && (
        <Badge variant="secondary" className="text-sm py-1 px-3">
          {scanResult}
        </Badge>
      )}

      {/* Main tabs: Browse | Import | Duplicates | Housekeeping */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="browse">
            <Music className="h-4 w-4 mr-1" /> Browse
          </TabsTrigger>
          <TabsTrigger value="import">
            <FolderInput className="h-4 w-4 mr-1" /> Import
          </TabsTrigger>
          <TabsTrigger value="duplicates">
            <Copy className="h-4 w-4 mr-1" /> Duplicates
          </TabsTrigger>
          <TabsTrigger value="housekeeping">
            <Wrench className="h-4 w-4 mr-1" /> Housekeeping
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tracks, artists, albums..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Tabs
                value={view}
                onValueChange={(v) => setView(v as typeof view)}
              >
                <TabsList>
                  <TabsTrigger value="tracks">
                    <List className="h-4 w-4 mr-1" /> Tracks
                  </TabsTrigger>
                  <TabsTrigger value="albums">
                    <Grid3X3 className="h-4 w-4 mr-1" /> Albums
                  </TabsTrigger>
                  <TabsTrigger value="artists">
                    <User className="h-4 w-4 mr-1" /> Artists
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {view === "tracks" && (
              <Card>
                <CardContent className="p-0">
                  <div className="grid grid-cols-[40px_1fr_1fr_80px] gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                    <span>#</span>
                    <span>Title</span>
                    <span>Album</span>
                    <span className="text-right">Duration</span>
                  </div>
                  {tracks.map((track, i) => (
                    <motion.div
                      key={track.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="grid grid-cols-[40px_1fr_1fr_80px] gap-4 px-4 py-2 hover:bg-secondary/30 transition-colors cursor-pointer group items-center"
                      onClick={() => playTrack(track, i)}
                    >
                      <span className="text-sm text-muted-foreground group-hover:hidden">
                        {i + 1 + (page - 1) * 50}
                      </span>
                      <Play className="h-4 w-4 hidden group-hover:block text-primary" />
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                          {track.coverPath ? (
                            <Image
                              src={track.coverPath}
                              alt={track.album}
                              width={40}
                              height={40}
                              className="object-cover"
                            />
                          ) : (
                            <Music className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {track.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {track.artist}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground truncate">
                        {track.album}
                      </span>
                      <span className="text-sm text-muted-foreground text-right">
                        {formatDuration(track.duration)}
                      </span>
                    </motion.div>
                  ))}
                  {tracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16">
                      <Music className="h-16 w-16 text-muted-foreground mb-4" />
                      <p className="text-lg text-muted-foreground">
                        No tracks found
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Scan your music library to get started
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {view === "albums" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {albums.map((album, i) => (
                  <motion.div
                    key={`${album.name}-${album.artist}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card
                      className="hover:bg-secondary/50 transition-colors cursor-pointer group"
                      onClick={() => {
                        const playerTracks = album.tracks.map(dbToPlayerTrack);
                        setQueue(playerTracks, 0);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="aspect-square rounded-lg bg-secondary mb-3 flex items-center justify-center overflow-hidden relative">
                          {album.coverPath ? (
                            <Image
                              src={album.coverPath}
                              alt={album.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <Disc3 className="h-10 w-10 text-muted-foreground" />
                          )}
                          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="icon"
                              className="rounded-full h-10 w-10 shadow-lg"
                            >
                              <Play className="h-4 w-4 ml-0.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="font-medium truncate text-sm">
                          {album.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {album.artist} · {album.tracks.length} tracks
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {view === "artists" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {artists.map((artist, i) => (
                  <motion.div
                    key={artist.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Card className="hover:bg-secondary/50 transition-colors cursor-pointer text-center">
                      <CardContent className="p-4">
                        <div className="w-20 h-20 rounded-full bg-secondary mx-auto mb-3 flex items-center justify-center overflow-hidden">
                          {artist.coverPath ? (
                            <Image
                              src={artist.coverPath}
                              alt={artist.name}
                              width={80}
                              height={80}
                              className="object-cover rounded-full"
                            />
                          ) : (
                            <User className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <p className="font-medium truncate text-sm">
                          {artist.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {artist.trackCount} tracks
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {total > 50 && view === "tracks" && (
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="flex items-center text-sm text-muted-foreground px-4">
                  Page {page} of {Math.ceil(total / 50)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / 50)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="import">
          <ImportTab />
        </TabsContent>

        <TabsContent value="duplicates">
          <DuplicatesTab />
        </TabsContent>

        <TabsContent value="housekeeping">
          <HousekeepingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
