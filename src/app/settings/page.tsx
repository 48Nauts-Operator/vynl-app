"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  Key,
  Speaker,
  Database,
  Save,
  RefreshCw,
  CheckCircle,
  Image,
  Plus,
  Trash2,
  Regex,
  HeartPulse,
  Loader2,
  Merge,
  AlertTriangle,
  FileX2,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatFileSize } from "@/lib/utils";

interface AlbumRule {
  id: number;
  pattern: string;
  targetAlbum: string;
  targetAlbumArtist: string | null;
  createdAt: string;
}

interface SplitAlbumArtist {
  name: string;
  trackCount: number;
}

interface SplitAlbum {
  album: string;
  artists: SplitAlbumArtist[];
  totalTracks: number;
  suggestedPrimary: string;
}

interface DuplicateFormat {
  title: string;
  album: string;
  m4aId: number;
  mp3Id: number;
  m4aPath: string;
  mp3Path: string;
  m4aSize: number;
  mp3Size: number;
}

export default function SettingsPage() {
  const [musicPath, setMusicPath] = useState("");
  const [vynlHost, setVynlHost] = useState("http://localhost:3000");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [replicateKey, setReplicateKey] = useState("");
  const [spotifyId, setSpotifyId] = useState("");
  const [spotifySecret, setSpotifySecret] = useState("");
  const [youtubeKey, setYoutubeKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [coverStatus, setCoverStatus] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);

  // Album rules state
  const [rules, setRules] = useState<AlbumRule[]>([]);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newPattern, setNewPattern] = useState("");
  const [newTargetAlbum, setNewTargetAlbum] = useState("");
  const [newTargetArtist, setNewTargetArtist] = useState("");
  const [rulesLoading, setRulesLoading] = useState(false);

  // Library Health state
  const [splitAlbums, setSplitAlbums] = useState<SplitAlbum[]>([]);
  const [splitLoading, setSplitLoading] = useState(false);
  const [mergeOverrides, setMergeOverrides] = useState<Record<string, string>>({});
  const [mergingAlbum, setMergingAlbum] = useState<string | null>(null);
  const [mergeAllLoading, setMergeAllLoading] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateFormat[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupCleanLoading, setDupCleanLoading] = useState(false);
  const [dupKeepFormat, setDupKeepFormat] = useState("m4a");
  const [dupResult, setDupResult] = useState<string | null>(null);

  useEffect(() => {
    setMusicPath(process.env.NEXT_PUBLIC_MUSIC_PATH || "");
    setVynlHost(process.env.NEXT_PUBLIC_VYNL_HOST || "http://localhost:3000");
    loadRules();
    loadSplitAlbums();
    loadDuplicateFormats();
  }, []);

  const loadRules = async () => {
    try {
      const res = await fetch("/api/album-rules");
      const data = await res.json();
      setRules(data.rules || []);
    } catch {}
  };

  const loadSplitAlbums = async () => {
    setSplitLoading(true);
    try {
      const res = await fetch("/api/library/housekeeping/split-albums");
      const data = await res.json();
      setSplitAlbums(data.splitAlbums || []);
    } catch {}
    setSplitLoading(false);
  };

  const mergeSingleAlbum = async (album: string) => {
    const primaryArtist = mergeOverrides[album] || splitAlbums.find((s) => s.album === album)?.suggestedPrimary;
    if (!primaryArtist) return;
    setMergingAlbum(album);
    try {
      const res = await fetch("/api/library/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge-split-album", album, primaryArtist }),
      });
      const data = await res.json();
      setMergeStatus((prev) => ({
        ...prev,
        [album]: data.merged ? `Merged ${data.tracksUpdated} tracks` : data.error || "Failed",
      }));
      // Remove from list
      setSplitAlbums((prev) => prev.filter((s) => s.album !== album));
    } catch {
      setMergeStatus((prev) => ({ ...prev, [album]: "Failed" }));
    }
    setMergingAlbum(null);
  };

  const mergeAllSplitAlbums = async () => {
    setMergeAllLoading(true);
    try {
      const res = await fetch("/api/library/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge-all-split-albums" }),
      });
      const data = await res.json();
      setMergeStatus({ _all: data.message || `Merged ${data.merged} albums` });
      setSplitAlbums([]);
    } catch {
      setMergeStatus({ _all: "Batch merge failed" });
    }
    setMergeAllLoading(false);
  };

  const loadDuplicateFormats = async () => {
    setDupLoading(true);
    try {
      const res = await fetch("/api/library/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect-duplicate-formats" }),
      });
      const data = await res.json();
      setDuplicates(data.duplicates || []);
    } catch {}
    setDupLoading(false);
  };

  const cleanDuplicateFormats = async () => {
    setDupCleanLoading(true);
    setDupResult(null);
    try {
      const res = await fetch("/api/library/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clean-duplicate-formats", keep: dupKeepFormat }),
      });
      const data = await res.json();
      setDupResult(data.message || `Removed ${data.removed} files`);
      setDuplicates([]);
    } catch {
      setDupResult("Cleanup failed");
    }
    setDupCleanLoading(false);
  };

  const addRule = async () => {
    if (!newPattern || !newTargetAlbum) return;
    setRulesLoading(true);
    try {
      await fetch("/api/album-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: newPattern,
          targetAlbum: newTargetAlbum,
          targetAlbumArtist: newTargetArtist || null,
        }),
      });
      setNewPattern("");
      setNewTargetAlbum("");
      setNewTargetArtist("");
      setShowAddRule(false);
      await loadRules();
    } catch {}
    setRulesLoading(false);
  };

  const deleteRule = async (id: number) => {
    await fetch(`/api/album-rules?id=${id}`, { method: "DELETE" });
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const applyRulesNow = async () => {
    setRulesLoading(true);
    try {
      await fetch("/api/library/scan", { method: "POST" });
      setCoverStatus("Library re-scanned with rules applied");
    } catch {
      setCoverStatus("Re-scan failed");
    }
    setRulesLoading(false);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your Vynl instance
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Music Library
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Library Path</Label>
            <Input
              value={musicPath}
              onChange={(e) => setMusicPath(e.target.value)}
              placeholder="/Users/zelda/Music"
            />
            <p className="text-xs text-muted-foreground">
              Set via MUSIC_LIBRARY_PATH in .env.local
            </p>
          </div>
          <div className="space-y-2">
            <Label>Vynl Host URL</Label>
            <Input
              value={vynlHost}
              onChange={(e) => setVynlHost(e.target.value)}
              placeholder="http://localhost:3000"
            />
            <p className="text-xs text-muted-foreground">
              Used for Sonos to reach back to Vynl for audio streaming
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Album Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Regex className="h-5 w-5" />
            Album Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Automatically group album series during library scans. Patterns use
            regex matching against album names.
          </p>

          {rules.length > 0 ? (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{rule.pattern}</p>
                    <p className="text-xs text-muted-foreground">
                      → {rule.targetAlbum}
                      {rule.targetAlbumArtist && ` by ${rule.targetAlbumArtist}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => deleteRule(rule.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No rules configured yet
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAddRule(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
            {rules.length > 0 && (
              <Button
                variant="outline"
                onClick={applyRulesNow}
                disabled={rulesLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {rulesLoading ? "Scanning..." : "Apply Rules Now"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Library Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Library Health
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Split Albums Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Split Albums</p>
                <p className="text-xs text-muted-foreground">
                  Albums fragmented by differing album artists (featured artists, duets)
                </p>
              </div>
              <Badge variant={splitAlbums.length > 0 ? "destructive" : "secondary"}>
                {splitLoading ? "..." : `${splitAlbums.length} detected`}
              </Badge>
            </div>

            {splitAlbums.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {splitAlbums.map((sa) => (
                  <div
                    key={sa.album}
                    className="p-3 rounded-lg border border-border bg-secondary/10 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{sa.album}</p>
                        <p className="text-xs text-muted-foreground">
                          {sa.artists.length <= 3
                            ? sa.artists.map((a) => `${a.name} (${a.trackCount})`).join(", ")
                            : `${sa.artists[0].name} (${sa.artists[0].trackCount}), +${sa.artists.length - 1} variants`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Merge as:</span>
                      <Select
                        value={mergeOverrides[sa.album] || sa.suggestedPrimary}
                        onValueChange={(v) => setMergeOverrides((prev) => ({ ...prev, [sa.album]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sa.artists.map((a) => (
                            <SelectItem key={a.name} value={a.name}>
                              {a.name} ({a.trackCount} tracks)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={mergingAlbum !== null}
                        onClick={() => mergeSingleAlbum(sa.album)}
                      >
                        {mergingAlbum === sa.album ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Merge className="h-3 w-3 mr-1" />
                        )}
                        Merge
                      </Button>
                    </div>
                    {mergeStatus[sa.album] && (
                      <p className="text-xs text-green-400 ml-6">{mergeStatus[sa.album]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {splitAlbums.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={mergeAllSplitAlbums}
                  disabled={mergeAllLoading || mergingAlbum !== null}
                >
                  {mergeAllLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Merge className="h-4 w-4 mr-2" />
                  )}
                  Merge All Split Albums
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={loadSplitAlbums}
                disabled={splitLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${splitLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            {mergeStatus._all && (
              <p className="text-sm text-green-400">{mergeStatus._all}</p>
            )}
          </div>

          <Separator />

          {/* Duplicate Formats Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Duplicate Formats</p>
                <p className="text-xs text-muted-foreground">
                  Tracks that exist in both .mp3 and .m4a formats
                </p>
              </div>
              <Badge variant={duplicates.length > 0 ? "secondary" : "outline"}>
                {dupLoading ? "..." : `${duplicates.length} found`}
              </Badge>
            </div>

            {duplicates.length > 0 && (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {duplicates.slice(0, 20).map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileX2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{d.album} — {d.title}</span>
                      <span className="text-xs opacity-50">
                        ({formatFileSize(d.mp3Size)} + {formatFileSize(d.m4aSize)})
                      </span>
                    </div>
                  ))}
                  {duplicates.length > 20 && (
                    <p className="text-xs text-muted-foreground">...and {duplicates.length - 20} more</p>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">Keep:</span>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="keepFormat"
                      checked={dupKeepFormat === "m4a"}
                      onChange={() => setDupKeepFormat("m4a")}
                      className="accent-primary"
                    />
                    .m4a <span className="text-xs text-muted-foreground">(recommended)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="keepFormat"
                      checked={dupKeepFormat === "mp3"}
                      onChange={() => setDupKeepFormat("mp3")}
                      className="accent-primary"
                    />
                    .mp3
                  </label>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={cleanDuplicateFormats}
                  disabled={dupCleanLoading}
                >
                  {dupCleanLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clean Duplicates
                </Button>
              </>
            )}

            {dupResult && (
              <p className="text-sm text-green-400">{dupResult}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Anthropic API Key
              <Badge variant="outline" className="text-xs">
                Required for AI
              </Badge>
            </Label>
            <Input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Replicate API Token
              <Badge variant="outline" className="text-xs">
                Cover Art
              </Badge>
            </Label>
            <Input
              type="password"
              value={replicateKey}
              onChange={(e) => setReplicateKey(e.target.value)}
              placeholder="r8_..."
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Spotify Client ID</Label>
            <Input
              value={spotifyId}
              onChange={(e) => setSpotifyId(e.target.value)}
              placeholder="Client ID"
            />
          </div>
          <div className="space-y-2">
            <Label>Spotify Client Secret</Label>
            <Input
              type="password"
              value={spotifySecret}
              onChange={(e) => setSpotifySecret(e.target.value)}
              placeholder="Client Secret"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              YouTube API Key
              <Badge variant="outline" className="text-xs">
                Optional
              </Badge>
            </Label>
            <Input
              type="password"
              value={youtubeKey}
              onChange={(e) => setYoutubeKey(e.target.value)}
              placeholder="AIza..."
            />
          </div>

          <p className="text-xs text-muted-foreground">
            API keys are stored in .env.local. Update the file and restart the
            server for changes to take effect.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Vynl uses SQLite stored at <code>vynl.db</code> in the project
            root.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                fetch("/api/library/scan", { method: "POST" });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-scan Library
            </Button>
            <Button
              variant="outline"
              disabled={coverLoading}
              onClick={async () => {
                setCoverLoading(true);
                setCoverStatus(null);
                try {
                  const res = await fetch("/api/library/housekeeping", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "rescan-covers" }),
                  });
                  const data = await res.json();
                  setCoverStatus(data.message || "Done");
                } catch {
                  setCoverStatus("Failed to rescan covers");
                } finally {
                  setCoverLoading(false);
                }
              }}
            >
              <Image className="h-4 w-4 mr-2" />
              {coverLoading ? "Scanning..." : "Re-scan Covers"}
            </Button>
          </div>
          {coverStatus && (
            <p className="text-sm text-muted-foreground mt-2">{coverStatus}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Speaker className="h-5 w-5" />
            Sonos Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vynl uses the Sonos CLI at{" "}
            <code>/opt/homebrew/bin/sonos</code>. Speakers are auto-discovered
            on your local network.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <a href="/speakers">
              <Speaker className="h-4 w-4 mr-2" />
              Manage Speakers
            </a>
          </Button>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full" size="lg">
        {saved ? (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            Saved
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </>
        )}
      </Button>

      {/* Add Rule Dialog */}
      <Dialog open={showAddRule} onOpenChange={setShowAddRule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Album Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pattern (regex)</Label>
              <Input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder='e.g. ^A State of Trance \d+'
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Regex pattern to match against album names
              </p>
            </div>
            <div className="space-y-2">
              <Label>Target Album</Label>
              <Input
                value={newTargetAlbum}
                onChange={(e) => setNewTargetAlbum(e.target.value)}
                placeholder="e.g. A State of Trance"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Target Album Artist{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={newTargetArtist}
                onChange={(e) => setNewTargetArtist(e.target.value)}
                placeholder="e.g. Armin van Buuren"
              />
            </div>
            <Button onClick={addRule} disabled={!newPattern || !newTargetAlbum}>
              Add Rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
