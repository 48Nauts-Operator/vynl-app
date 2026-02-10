"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  FolderOpen,
  Key,
  Speaker,
  Database,
  Save,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import { motion } from "framer-motion";

export default function SettingsPage() {
  const [musicPath, setMusicPath] = useState("");
  const [tunifyHost, setTunifyHost] = useState("http://localhost:3000");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [replicateKey, setReplicateKey] = useState("");
  const [spotifyId, setSpotifyId] = useState("");
  const [spotifySecret, setSpotifySecret] = useState("");
  const [youtubeKey, setYoutubeKey] = useState("");
  const [saved, setSaved] = useState(false);

  // These are environment variables - show current config status
  useEffect(() => {
    // Just show masked versions of what's configured
    setMusicPath(process.env.NEXT_PUBLIC_MUSIC_PATH || "");
    setTunifyHost(process.env.NEXT_PUBLIC_TUNIFY_HOST || "http://localhost:3000");
  }, []);

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
          Configure your Tunify instance
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
            <Label>Tunify Host URL</Label>
            <Input
              value={tunifyHost}
              onChange={(e) => setTunifyHost(e.target.value)}
              placeholder="http://localhost:3000"
            />
            <p className="text-xs text-muted-foreground">
              Used for Sonos to reach back to Tunify for audio streaming
            </p>
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
            Tunify uses SQLite stored at <code>tunify.db</code> in the project
            root.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                fetch("/api/library/scan", { method: "POST" });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-scan Library
            </Button>
          </div>
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
            Tunify uses the Sonos CLI at{" "}
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
    </motion.div>
  );
}
