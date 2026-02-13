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
  ToggleLeft,
  Sparkles,
  Check,
  X,
  Music2,
  Ban,
  ChevronDown,
  BrainCircuit,
} from "lucide-react";
import { motion } from "framer-motion";
import { formatFileSize } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useSettingsStore, type FeatureFlags } from "@/store/settings";
import SpotifyExtractCard from "@/components/spotify/SpotifyExtractCard";

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

  // Lyrics batch state
  const [lyricsStats, setLyricsStats] = useState<{
    totalTracks: number; withLyrics: number; syncedLyrics: number;
    plainLyrics: number; missing: number; coverage: string;
  } | null>(null);
  const [lyricsBatch, setLyricsBatch] = useState<{
    status: string; total: number; processed: number; found: number;
    notFound: number; errors: number; currentTrack?: string;
  } | null>(null);
  const [lyricsBatchRunning, setLyricsBatchRunning] = useState(false);

  // AI album analysis state
  interface AiSuggestion {
    albums: { name: string; artist: string; trackCount: number; year: number | null }[];
    reason: string;
    shouldMerge: boolean;
    suggestedRule: { pattern: string; targetAlbum: string; targetAlbumArtist: string | null } | null;
    explanation: string | null;
  }
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiPhase, setAiPhase] = useState<string | null>(null);
  const [aiPhaseDetail, setAiPhaseDetail] = useState<string | null>(null);
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());

  // Library Health state
  const [splitAlbums, setSplitAlbums] = useState<SplitAlbum[]>([]);
  const [splitLoading, setSplitLoading] = useState(false);
  const [mergeOverrides, setMergeOverrides] = useState<Record<string, string>>({});
  const [mergingAlbum, setMergingAlbum] = useState<string | null>(null);
  const [mergeAllLoading, setMergeAllLoading] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<Record<string, string>>({});
  const [compAlbums, setCompAlbums] = useState<{ album: string; distinctArtists: number; tracks: number }[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compFixResult, setCompFixResult] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateFormat[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupKeepFormat, setDupKeepFormat] = useState("m4a");
  const [dupCleanJob, setDupCleanJob] = useState<{
    status: string; total: number; processed: number; removed: number;
    errors: number; freedBytes: number; currentFile?: string;
  } | null>(null);
  const [dupCleanRunning, setDupCleanRunning] = useState(false);

  // Track analysis (AI DJ audio features) state
  const [trackAnalysis, setTrackAnalysis] = useState<{
    status: string; phase?: string; processed: number; total: number;
    enriched: number; errors: number;
    totalTracks: number; analyzedTracks: number;
  } | null>(null);
  const [trackAnalysisRunning, setTrackAnalysisRunning] = useState(false);

  const loadTrackAnalysisStatus = async () => {
    try {
      const res = await fetch("/api/library/analyze-tracks");
      const data = await res.json();
      setTrackAnalysis(data);
      if (data.status === "running") {
        setTrackAnalysisRunning(true);
      }
    } catch {}
  };

  const startTrackAnalysis = async () => {
    setTrackAnalysisRunning(true);
    try {
      await fetch("/api/library/analyze-tracks", { method: "POST" });
    } catch {}
  };

  const cancelTrackAnalysis = async () => {
    try {
      await fetch("/api/library/analyze-tracks", { method: "DELETE" });
    } catch {}
  };

  useEffect(() => {
    setMusicPath(process.env.NEXT_PUBLIC_MUSIC_PATH || "");
    setVynlHost(process.env.NEXT_PUBLIC_VYNL_HOST || "http://localhost:3000");
    loadRules();
    loadSplitAlbums();
    loadCompilations();
    loadDuplicateFormats();
    loadLyricsStats();
    loadTrackAnalysisStatus();
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

  const loadCompilations = async () => {
    setCompLoading(true);
    setCompFixResult(null);
    try {
      const res = await fetch("/api/library/housekeeping/fix-compilations");
      const data = await res.json();
      setCompAlbums(data.albums || []);
    } catch {}
    setCompLoading(false);
  };

  const fixCompilations = async () => {
    setCompLoading(true);
    try {
      const res = await fetch("/api/library/housekeeping/fix-compilations", { method: "POST" });
      const data = await res.json();
      setCompFixResult(`Fixed ${data.fixed} albums (${data.tracksUpdated} tracks updated)`);
      setCompAlbums([]);
    } catch {
      setCompFixResult("Failed to fix compilations");
    }
    setCompLoading(false);
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

  const startDupClean = async () => {
    setDupCleanRunning(true);
    try {
      await fetch("/api/library/housekeeping/duplicate-clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep: dupKeepFormat }),
      });
    } catch {}
  };

  const cancelDupClean = async () => {
    try {
      await fetch("/api/library/housekeeping/duplicate-clean", { method: "DELETE" });
    } catch {}
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

  const loadLyricsStats = async () => {
    try {
      const res = await fetch("/api/lyrics/stats");
      const data = await res.json();
      if (!data.error) setLyricsStats(data);
    } catch {}
  };

  const startLyricsBatch = async () => {
    setLyricsBatchRunning(true);
    try {
      await fetch("/api/lyrics/batch", { method: "POST" });
    } catch {}
  };

  const cancelLyricsBatch = async () => {
    try {
      await fetch("/api/lyrics/batch", { method: "DELETE" });
    } catch {}
  };

  // Poll lyrics batch job
  useEffect(() => {
    if (!lyricsBatchRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/lyrics/batch");
        const data = await res.json();
        if (data.status === "idle") return;
        setLyricsBatch(data);
        if (data.status === "complete" || data.status === "cancelled" || data.status === "error") {
          setLyricsBatchRunning(false);
          loadLyricsStats();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [lyricsBatchRunning]);

  // Check if a lyrics batch job is already running on mount
  useEffect(() => {
    fetch("/api/lyrics/batch").then((r) => r.json()).then((data) => {
      if (data.status === "running") {
        setLyricsBatch(data);
        setLyricsBatchRunning(true);
      }
    }).catch(() => {});
  }, []);

  // Poll duplicate clean job
  useEffect(() => {
    if (!dupCleanRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/library/housekeeping/duplicate-clean");
        const data = await res.json();
        if (data.status === "idle") return;
        setDupCleanJob(data);
        if (data.status === "complete" || data.status === "cancelled" || data.status === "error") {
          setDupCleanRunning(false);
          setDuplicates([]);
          loadDuplicateFormats();
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [dupCleanRunning]);

  // Check if a dup clean job is already running on mount
  useEffect(() => {
    fetch("/api/library/housekeeping/duplicate-clean").then((r) => r.json()).then((data) => {
      if (data.status === "running") {
        setDupCleanJob(data);
        setDupCleanRunning(true);
      }
    }).catch(() => {});
  }, []);

  // Poll track analysis job
  useEffect(() => {
    if (!trackAnalysisRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/library/analyze-tracks");
        const data = await res.json();
        setTrackAnalysis(data);
        if (data.status === "complete" || data.status === "cancelled" || data.status === "error") {
          setTrackAnalysisRunning(false);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [trackAnalysisRunning]);

  // Check if an AI analysis job is already running on mount
  useEffect(() => {
    fetch("/api/library/housekeeping/album-analyze").then((r) => r.json()).then((data) => {
      if (data.status === "running") {
        setAiAnalyzing(true);
        setAiPhase(data.phase);
        setAiPhaseDetail(data.phaseDetail);
      } else if (data.status === "complete" && data.suggestions?.length > 0) {
        setAiSuggestions(data.suggestions);
        setAiMessage(data.message || null);
      }
    }).catch(() => {});
  }, []);

  const runAiAnalysis = async () => {
    setAiAnalyzing(true);
    setAiMessage(null);
    setAiPhase(null);
    setAiPhaseDetail(null);
    setAiSuggestions([]);
    setAcceptedIndices(new Set());
    try {
      const res = await fetch("/api/library/housekeeping/album-analyze", { method: "POST" });
      const data = await res.json();
      if (data.error && res.status !== 200) {
        setAiMessage(data.error);
        setAiAnalyzing(false);
      }
      // Polling will handle the rest
    } catch {
      setAiMessage("Analysis failed");
      setAiAnalyzing(false);
    }
  };

  // Poll AI analysis job status
  useEffect(() => {
    if (!aiAnalyzing) return;
    const poll = async () => {
      try {
        const res = await fetch("/api/library/housekeeping/album-analyze");
        const data = await res.json();
        setAiPhase(data.phase || null);
        setAiPhaseDetail(data.phaseDetail || null);
        if (data.status === "complete") {
          setAiSuggestions(data.suggestions || []);
          setAiMessage(data.message || null);
          setAiAnalyzing(false);
        } else if (data.status === "error") {
          setAiMessage(data.error || "Analysis failed");
          setAiAnalyzing(false);
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [aiAnalyzing]);

  const acceptSuggestion = async (index: number) => {
    const suggestion = aiSuggestions[index];
    if (!suggestion?.suggestedRule) return;
    try {
      await fetch("/api/album-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: suggestion.suggestedRule.pattern,
          targetAlbum: suggestion.suggestedRule.targetAlbum,
          targetAlbumArtist: suggestion.suggestedRule.targetAlbumArtist,
        }),
      });
      setAcceptedIndices((prev) => new Set(prev).add(index));
      await loadRules();
    } catch {}
  };

  const acceptAllSuggestions = async () => {
    for (let i = 0; i < aiSuggestions.length; i++) {
      if (!acceptedIndices.has(i) && aiSuggestions[i].suggestedRule) {
        await acceptSuggestion(i);
      }
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const { features, toggleFeature } = useSettingsStore();

  // Collapsible sections — Library Health open by default
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["health"]));
  const toggle = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const isOpen = (key: string) => openSections.has(key);

  const featureConfig: Array<{
    key: keyof FeatureFlags;
    label: string;
    description: string;
  }> = [
    { key: "podcasts", label: "Podcasts", description: "RSS feeds, episode downloads, and Fabric AI analysis" },
    { key: "youtube", label: "YouTube", description: "Download videos/audio, extract transcripts with Fabric AI" },
    { key: "partyMode", label: "Party Mode", description: "Full-screen lyrics display with visualizer" },
    { key: "discover", label: "Discover", description: "AI-powered music recommendations" },
    { key: "tasteProfile", label: "Taste Profile", description: "Listening habits and music preferences analysis" },
    { key: "playlists", label: "Playlists", description: "Create and manage custom playlists" },
  ];

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

      {/* Feature Toggles */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("features")}>
          <CardTitle className="flex items-center gap-2">
            <ToggleLeft className="h-5 w-5" />
            Features
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("features") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("features") && (
          <CardContent>
            <div className="grid gap-3">
              {featureConfig.map((feat) => (
                <div
                  key={feat.key}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/10 border border-border"
                >
                  <div className="min-w-0 mr-4">
                    <p className="text-sm font-medium">{feat.label}</p>
                    <p className="text-xs text-muted-foreground">{feat.description}</p>
                  </div>
                  <Switch
                    checked={features[feat.key]}
                    onCheckedChange={() => toggleFeature(feat.key)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Spotify Data Extract */}
      <SpotifyExtractCard />

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("library")}>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Music Library
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("library") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("library") && (
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
        )}
      </Card>

      {/* Album Rules */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("rules")}>
          <CardTitle className="flex items-center gap-2">
            <Regex className="h-5 w-5" />
            Album Rules
            {rules.length > 0 && !isOpen("rules") && (
              <Badge variant="secondary" className="ml-1 text-xs">{rules.length}</Badge>
            )}
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("rules") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("rules") && (
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
            <Button
              variant="outline"
              onClick={runAiAnalysis}
              disabled={aiAnalyzing || rulesLoading}
            >
              {aiAnalyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {aiAnalyzing ? "Analyzing..." : "AI Analyze"}
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

          {/* AI Analysis Progress */}
          {aiAnalyzing && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  {aiPhase === "scanning" && "Scanning Library..."}
                  {aiPhase === "matching" && "Finding Similar Albums..."}
                  {aiPhase === "ai_analyzing" && "AI Analyzing Groups..."}
                  {!aiPhase && "Starting..."}
                </span>
              </div>
              {aiPhaseDetail && (
                <p className="text-xs text-muted-foreground ml-6">{aiPhaseDetail}</p>
              )}
              <div className="flex gap-3 ml-6">
                {aiPhase === "scanning" && (
                  <div className="h-1 flex-1 rounded-full bg-primary/20 overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: "30%" }} />
                  </div>
                )}
                {aiPhase === "matching" && (
                  <div className="h-1 flex-1 rounded-full bg-primary/20 overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full animate-pulse" style={{ width: "60%" }} />
                  </div>
                )}
                {aiPhase === "ai_analyzing" && (
                  <div className="h-1 flex-1 rounded-full bg-primary/20 overflow-hidden">
                    <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "85%" }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Suggestions */}
          {(aiSuggestions.length > 0 || aiMessage) && (
            <div className="space-y-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">AI Suggestions</span>
                </div>
                {aiSuggestions.length > 0 && acceptedIndices.size < aiSuggestions.length && (
                  <Button variant="outline" size="sm" onClick={acceptAllSuggestions}>
                    <Check className="h-3 w-3 mr-1" />
                    Accept All ({aiSuggestions.length - acceptedIndices.size})
                  </Button>
                )}
              </div>

              {aiMessage && (
                <p className="text-xs text-muted-foreground">{aiMessage}</p>
              )}

              {aiSuggestions.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {aiSuggestions.map((s, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border space-y-2 ${
                        acceptedIndices.has(i)
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-border bg-secondary/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap gap-1 mb-1">
                            {s.albums.map((a, j) => (
                              <Badge key={j} variant="secondary" className="text-xs">
                                {a.name} ({a.trackCount})
                              </Badge>
                            ))}
                          </div>
                          {s.explanation && (
                            <p className="text-xs text-muted-foreground">{s.explanation}</p>
                          )}
                        </div>
                        {!acceptedIndices.has(i) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 h-7"
                            onClick={() => acceptSuggestion(i)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Accept
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-green-400 border-green-400/30 shrink-0">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Added
                          </Badge>
                        )}
                      </div>
                      {s.suggestedRule && (
                        <div className="text-xs font-mono text-muted-foreground ml-1">
                          <span className="text-primary/70">/{s.suggestedRule.pattern}/i</span>
                          <span className="mx-1">&rarr;</span>
                          <span>{s.suggestedRule.targetAlbum}</span>
                          {s.suggestedRule.targetAlbumArtist && (
                            <span className="opacity-60"> by {s.suggestedRule.targetAlbumArtist}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {acceptedIndices.size > 0 && (
                <div className="flex items-center gap-2 pt-2">
                  <p className="text-xs text-green-400">
                    {acceptedIndices.size} rule{acceptedIndices.size !== 1 ? "s" : ""} added.
                  </p>
                  <Button variant="outline" size="sm" onClick={applyRulesNow} disabled={rulesLoading}>
                    <RefreshCw className={`h-3 w-3 mr-1 ${rulesLoading ? "animate-spin" : ""}`} />
                    Apply Now
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
        )}
      </Card>

      {/* Library Health */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("health")}>
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Library Health
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("health") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("health") && (
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

          {/* Compilations Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Compilations</p>
                <p className="text-xs text-muted-foreground">
                  Albums with many different artists that need album_artist set to &quot;Various Artists&quot;
                </p>
              </div>
              <Badge variant={compAlbums.length > 0 ? "destructive" : "secondary"}>
                {compLoading ? "..." : `${compAlbums.length} detected`}
              </Badge>
            </div>

            {compAlbums.length > 0 && (
              <div className="space-y-2">
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {compAlbums.map((ca) => (
                    <div key={ca.album} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/10">
                      <span className="truncate flex-1">{ca.album}</span>
                      <span className="text-muted-foreground ml-2 shrink-0">
                        {ca.distinctArtists} artists, {ca.tracks} tracks
                      </span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={fixCompilations} disabled={compLoading}>
                  {compLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Fix All — Set to &quot;Various Artists&quot;
                </Button>
              </div>
            )}

            {compFixResult && (
              <p className="text-sm text-green-400">{compFixResult}</p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadCompilations} disabled={compLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${compLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
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

            {duplicates.length > 0 && !dupCleanRunning && (
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
                  onClick={startDupClean}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clean {duplicates.length} Duplicates
                </Button>
              </>
            )}

            {/* Duplicate clean progress */}
            {dupCleanJob && dupCleanRunning && (
              <div className="space-y-2 p-3 rounded-lg border border-border bg-secondary/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-sm">Cleaning duplicates...</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {dupCleanJob.processed}/{dupCleanJob.total}
                  </span>
                </div>
                {dupCleanJob.total > 0 && (
                  <Progress
                    value={Math.round((dupCleanJob.processed / dupCleanJob.total) * 100)}
                    className="h-1.5"
                  />
                )}
                {dupCleanJob.currentFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    {dupCleanJob.currentFile}
                  </p>
                )}
                <div className="flex gap-3 text-xs">
                  <span className="text-green-400">{dupCleanJob.removed} removed</span>
                  <span className="text-muted-foreground">
                    {((dupCleanJob.freedBytes || 0) / 1024 / 1024).toFixed(1)} MB freed
                  </span>
                  {dupCleanJob.errors > 0 && (
                    <span className="text-red-400">{dupCleanJob.errors} errors</span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={cancelDupClean}>
                  <Ban className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
              </div>
            )}

            {/* Completed clean summary */}
            {dupCleanJob && !dupCleanRunning && dupCleanJob.status !== "idle" && (
              <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>
                    {dupCleanJob.status === "complete" ? "Cleanup complete" : `Cleanup ${dupCleanJob.status}`}:
                    {" "}{dupCleanJob.removed} files removed, {((dupCleanJob.freedBytes || 0) / 1024 / 1024).toFixed(1)} MB freed
                  </span>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Lyrics Coverage Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Lyrics Coverage</p>
                <p className="text-xs text-muted-foreground">
                  Pre-fetch lyrics for Party Mode (karaoke)
                </p>
              </div>
              {lyricsStats && (
                <Badge variant={parseInt(lyricsStats.coverage) > 50 ? "secondary" : "outline"}>
                  {lyricsStats.coverage} coverage
                </Badge>
              )}
            </div>

            {lyricsStats && (
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center p-2 rounded bg-secondary/20">
                  <p className="text-lg font-bold">{lyricsStats.totalTracks}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/20">
                  <p className="text-lg font-bold text-green-400">{lyricsStats.syncedLyrics}</p>
                  <p className="text-xs text-muted-foreground">Synced</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/20">
                  <p className="text-lg font-bold text-blue-400">{lyricsStats.plainLyrics}</p>
                  <p className="text-xs text-muted-foreground">Plain</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/20">
                  <p className="text-lg font-bold text-muted-foreground">{lyricsStats.missing}</p>
                  <p className="text-xs text-muted-foreground">Missing</p>
                </div>
              </div>
            )}

            {/* Batch progress */}
            {lyricsBatch && lyricsBatchRunning && (
              <div className="space-y-2 p-3 rounded-lg border border-border bg-secondary/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-sm">Fetching lyrics...</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {lyricsBatch.processed}/{lyricsBatch.total}
                  </span>
                </div>
                {lyricsBatch.total > 0 && (
                  <Progress
                    value={Math.round((lyricsBatch.processed / lyricsBatch.total) * 100)}
                    className="h-1.5"
                  />
                )}
                {lyricsBatch.currentTrack && (
                  <p className="text-xs text-muted-foreground truncate">
                    {lyricsBatch.currentTrack}
                  </p>
                )}
                <div className="flex gap-3 text-xs">
                  <span className="text-green-400">{lyricsBatch.found} found</span>
                  <span className="text-muted-foreground">{lyricsBatch.notFound} not found</span>
                  {lyricsBatch.errors > 0 && (
                    <span className="text-red-400">{lyricsBatch.errors} errors</span>
                  )}
                </div>
              </div>
            )}

            {/* Completed batch summary */}
            {lyricsBatch && !lyricsBatchRunning && lyricsBatch.status !== "idle" && (
              <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>
                    {lyricsBatch.status === "complete" ? "Batch complete" : `Batch ${lyricsBatch.status}`}:
                    {" "}{lyricsBatch.found} lyrics found, {lyricsBatch.notFound} not available
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!lyricsBatchRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startLyricsBatch}
                  disabled={!lyricsStats || lyricsStats.missing === 0}
                >
                  <Music2 className="h-4 w-4 mr-2" />
                  {lyricsStats?.missing === 0 ? "All lyrics fetched" : `Fetch All Lyrics (${lyricsStats?.missing || 0} missing)`}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={cancelLyricsBatch}>
                  <Ban className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={loadLyricsStats}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      {/* Library Analysis (AI DJ) */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("analysis")}>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5" />
            Library Analysis
            {trackAnalysis && !isOpen("analysis") && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {trackAnalysis.analyzedTracks}/{trackAnalysis.totalTracks}
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("analysis") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("analysis") && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Analyze your library with AI to estimate BPM, energy, key, and refined genre for each track.
              This data powers the AI DJ&apos;s transition planning and harmonic mixing.
            </p>

            {/* Stats grid */}
            {trackAnalysis && (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 rounded bg-secondary/20">
                  <p className="text-lg font-bold">{trackAnalysis.totalTracks}</p>
                  <p className="text-xs text-muted-foreground">Total Tracks</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/20">
                  <p className="text-lg font-bold text-green-400">{trackAnalysis.analyzedTracks}</p>
                  <p className="text-xs text-muted-foreground">Analyzed</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/20">
                  <p className="text-lg font-bold text-muted-foreground">
                    {trackAnalysis.totalTracks > 0
                      ? Math.round((trackAnalysis.analyzedTracks / trackAnalysis.totalTracks) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Coverage</p>
                </div>
              </div>
            )}

            {/* Progress bar while running */}
            {trackAnalysis && trackAnalysisRunning && (
              <div className="space-y-2 p-3 rounded-lg border border-border bg-secondary/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-sm">Analyzing tracks with AI...</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {trackAnalysis.processed}/{trackAnalysis.total}
                  </span>
                </div>
                {trackAnalysis.total > 0 && (
                  <Progress
                    value={Math.round((trackAnalysis.processed / trackAnalysis.total) * 100)}
                    className="h-1.5"
                  />
                )}
                <div className="flex gap-3 text-xs">
                  <span className="text-green-400">{trackAnalysis.enriched} enriched</span>
                  {trackAnalysis.errors > 0 && (
                    <span className="text-red-400">{trackAnalysis.errors} errors</span>
                  )}
                </div>
              </div>
            )}

            {/* Completed summary */}
            {trackAnalysis && !trackAnalysisRunning && trackAnalysis.status === "complete" && trackAnalysis.total > 0 && (
              <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>
                    Analysis complete: {trackAnalysis.enriched} tracks enriched
                    {trackAnalysis.errors > 0 && `, ${trackAnalysis.errors} errors`}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {!trackAnalysisRunning ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startTrackAnalysis}
                  disabled={trackAnalysis?.analyzedTracks === trackAnalysis?.totalTracks && (trackAnalysis?.totalTracks ?? 0) > 0}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {trackAnalysis?.analyzedTracks === trackAnalysis?.totalTracks && (trackAnalysis?.totalTracks ?? 0) > 0
                    ? "All tracks analyzed"
                    : `Analyze Library with AI${trackAnalysis ? ` (${(trackAnalysis.totalTracks - trackAnalysis.analyzedTracks)} remaining)` : ""}`}
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={cancelTrackAnalysis}>
                  <Ban className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={loadTrackAnalysisStatus}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("apikeys")}>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("apikeys") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("apikeys") && (
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
        )}
      </Card>

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("database")}>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("database") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("database") && (
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
        )}
      </Card>

      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => toggle("sonos")}>
          <CardTitle className="flex items-center gap-2">
            <Speaker className="h-5 w-5" />
            Sonos Configuration
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isOpen("sonos") ? "" : "-rotate-90"}`} />
          </CardTitle>
        </CardHeader>
        {isOpen("sonos") && (
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
        )}
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
