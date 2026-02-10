"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlayerStore, Track as PlayerTrack } from "@/store/player";
import { Track as DBTrack } from "@/lib/db/schema";
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

// ---- Import Tab ----
function ImportTab() {
  const [importPath, setImportPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

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

  return (
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
          <Button onClick={handleImport} disabled={importing || !importPath.trim()}>
            {importing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FolderInput className="h-4 w-4 mr-2" />
            )}
            {importing ? "Importing..." : "Import"}
          </Button>
        </div>
        {result && (
          <Card className="bg-secondary/30">
            <CardContent className="p-4 text-sm">
              {result.error ? (
                <p className="text-red-400">Error: {result.error}</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-green-400">Import successful</p>
                  {result.output && (
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {result.output}
                    </pre>
                  )}
                  {result.scan && (
                    <p>
                      Library re-scanned: {result.scan.scanned} files, {result.scan.added} added
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
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
