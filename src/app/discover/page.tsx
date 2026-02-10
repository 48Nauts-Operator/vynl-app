"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { usePlayerStore } from "@/store/player";
import {
  Compass,
  Music,
  Loader2,
  ArrowRight,
  ThumbsDown,
  Minus,
  Star,
  Sparkles,
  Library,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

const GENRE_OPTIONS = [
  "Rock", "Pop", "Jazz", "Classical", "Hip-Hop", "R&B",
  "Country", "Blues", "Metal", "Folk", "Indie", "Soul", "Funk", "Punk",
  "Reggae", "Latin", "Afrobeat",
  // Electronic sub-genres
  "House", "Techno", "Trance", "Vocal Trance", "Drum & Bass",
  "Dubstep", "Ambient", "Downtempo", "IDM", "Synthwave",
  "Deep House", "Progressive House", "Minimal", "Hardstyle",
  "Lo-Fi", "Trip-Hop", "Garage", "Breakbeat",
];

const ERA_OPTIONS = [
  { label: "Any Era", value: "any" },
  { label: "60s-70s", value: "60s-70s" },
  { label: "80s", value: "80s" },
  { label: "90s", value: "90s" },
  { label: "2000s", value: "2000s" },
  { label: "2010s", value: "2010s" },
  { label: "2020s", value: "2020s" },
];

type Step = "preferences" | "sampling" | "generating" | "complete" | "empty-library";

export default function DiscoverPage() {
  const [step, setStep] = useState<Step>("preferences");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [moodLevel, setMoodLevel] = useState(5);
  const [tempoLevel, setTempoLevel] = useState(5);
  const [complexityLevel, setComplexityLevel] = useState(5);
  const [era, setEra] = useState("any");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sampleTracks, setSampleTracks] = useState<any[]>([]);
  const [sampleSource, setSampleSource] = useState<string>("local");
  const [sonosSpeaker, setSonosSpeaker] = useState<string | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [currentSample, setCurrentSample] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [profileText, setProfileText] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { setTrack, sonosSpeaker: playerSonosSpeaker, setOutputTarget, setSonosSpeaker: setPlayerSonosSpeaker } = usePlayerStore();

  const MAX_GENRES = 3;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) return prev.filter((g) => g !== genre);
      if (prev.length >= MAX_GENRES) return prev; // cap at 3
      return [...prev, genre];
    });
  };

  const startSession = async () => {
    setLoadingSamples(true);

    // Create session
    const sessionRes = await fetch("/api/discover/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genres: selectedGenres,
        moodLevel,
        tempoLevel,
        eraPreference: era,
      }),
    });
    const session = await sessionRes.json();
    setSessionId(session.id);

    // Get sample tracks with tempo/energy/era for better matching
    const params = new URLSearchParams();
    if (selectedGenres.length > 0) params.set("genres", selectedGenres.join(","));
    params.set("tempo", tempoLevel.toString());
    params.set("energy", moodLevel.toString());
    if (era !== "any") params.set("era", era);
    const samplesRes = await fetch(`/api/discover/samples?${params.toString()}`);
    const samples = await samplesRes.json();
    setLoadingSamples(false);

    const trackList = samples.tracks || [];
    setSampleTracks(trackList);
    setSampleSource(samples.source || "local");
    setSonosSpeaker(samples.speakerName || null);
    setSampleError(samples.error || null);
    setCurrentSample(0);

    if (trackList.length === 0) {
      setStep("empty-library");
      return;
    }

    setStep("sampling");

    // Start playing first track (pass trackList, speaker, and source since React state isn't updated yet)
    playTrackAtIndex(0, trackList, samples.speakerName, samples.source);
  };

  const playTrackAtIndex = async (index: number, tracks?: any[], speaker?: string | null, source?: string) => {
    const list = tracks || sampleTracks;
    const track = list[index];
    if (!track) return;

    const targetSpeaker = playerSonosSpeaker || speaker || sonosSpeaker;
    const trackSource = source || sampleSource;

    if (trackSource === "spotify" && targetSpeaker && track.spotifyUri) {
      // Update player bar info (use sourceId so it shows track, but DON'T
      // include filePath — prevents the audio hook from trying browser playback)
      setOutputTarget("sonos");
      setPlayerSonosSpeaker(targetSpeaker);
      setTrack({
        id: track.id || index,
        title: track.title,
        artist: track.artist,
        album: track.album || "",
        duration: 0,
        source: "spotify",
        sourceId: track.spotifyUri,
      });

      // Send Sonos command directly — don't rely on the audio hook
      try {
        const res = await fetch("/api/sonos/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speaker: targetSpeaker,
            action: "open-spotify",
            spotifyUri: track.spotifyUri,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error(`Sonos open-spotify failed: ${err}`);
        }
      } catch (err) {
        console.error("Sonos command error:", err);
      }
    } else if (track.filePath) {
      setTrack({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || "",
        duration: track.duration || 0,
        filePath: track.filePath,
        coverPath: track.coverPath || undefined,
        source: "local",
      });
    }
  };

  const submitFeedback = async (rating: "bad" | "ok" | "amazing") => {
    const track = sampleTracks[currentSample];
    if (!track || !sessionId) return;

    // Fire-and-forget feedback save (don't block UI)
    fetch("/api/discover/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        trackId: track.id || null,
        trackTitle: track.title,
        trackArtist: track.artist,
        rating,
      }),
    }).catch(console.error);

    setFeedbackCount((c) => c + 1);

    // Find next playable track (skip any without URIs)
    let next = currentSample + 1;
    while (next < sampleTracks.length) {
      const candidate = sampleTracks[next];
      if (sampleSource === "spotify" && candidate.spotifyUri) break;
      if (sampleSource === "local" && candidate.filePath) break;
      next++;
    }

    if (next < sampleTracks.length) {
      setCurrentSample(next);
      playTrackAtIndex(next);
    } else {
      // No more tracks — generate profile
      generateProfile();
    }
  };

  const generateProfile = async () => {
    setStep("generating");
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      setProfileText(data.profileText || "Profile generated successfully!");
      setStep("complete");
    } catch {
      setProfileText("Failed to generate profile. Please try again.");
      setStep("complete");
    } finally {
      setGenerating(false);
    }
  };

  const currentSampleTrack = sampleTracks[currentSample];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Compass className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Discovery Station</h1>
          <p className="text-muted-foreground">
            Let AI understand your music taste
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {["Preferences", "Sampling", "Profile"].map((label, i) => (
          <React.Fragment key={label}>
            <Badge
              variant={
                (i === 0 && step === "preferences") ||
                (i === 1 && step === "sampling") ||
                (i === 2 && (step === "generating" || step === "complete"))
                  ? "default"
                  : "secondary"
              }
            >
              {i + 1}. {label}
            </Badge>
            {i < 2 && (
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            )}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === "preferences" && (
          <motion.div
            key="preferences"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Select Your Genres
                  <span className="text-sm font-normal text-muted-foreground">
                    {selectedGenres.length}/{MAX_GENRES} selected
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {GENRE_OPTIONS.map((genre) => {
                    const isSelected = selectedGenres.includes(genre);
                    const isDisabled = !isSelected && selectedGenres.length >= MAX_GENRES;
                    return (
                      <Badge
                        key={genre}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer text-sm py-1.5 px-3 transition-colors ${
                          isDisabled
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-primary/20"
                        }`}
                        onClick={() => toggleGenre(genre)}
                      >
                        {genre}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mood, Tempo & Complexity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Chill</span>
                    <span className="text-muted-foreground">
                      Energy: {moodLevel}/10
                    </span>
                    <span>Energetic</span>
                  </div>
                  <Slider
                    value={[moodLevel]}
                    max={10}
                    min={1}
                    step={1}
                    onValueChange={([v]) => setMoodLevel(v)}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Slow</span>
                    <span className="text-muted-foreground">
                      Tempo: {tempoLevel}/10
                    </span>
                    <span>Fast</span>
                  </div>
                  <Slider
                    value={[tempoLevel]}
                    max={10}
                    min={1}
                    step={1}
                    onValueChange={([v]) => setTempoLevel(v)}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Simple</span>
                    <span className="text-muted-foreground">
                      Complexity: {complexityLevel}/10
                    </span>
                    <span>Brainy</span>
                  </div>
                  <Slider
                    value={[complexityLevel]}
                    max={10}
                    min={1}
                    step={1}
                    onValueChange={([v]) => setComplexityLevel(v)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Era Preference</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {ERA_OPTIONS.map((opt) => (
                    <Badge
                      key={opt.value}
                      variant={era === opt.value ? "default" : "outline"}
                      className="cursor-pointer text-sm py-1.5 px-3"
                      onClick={() => setEra(opt.value)}
                    >
                      {opt.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={startSession}
              size="lg"
              className="w-full"
              disabled={selectedGenres.length === 0 || loadingSamples}
            >
              {loadingSamples ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Finding tracks...
                </>
              ) : (
                <>
                  Start Discovery Session
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </motion.div>
        )}

        {step === "empty-library" && (
          <motion.div
            key="empty-library"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Library className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-bold mb-2">Spotify Setup Needed</h2>
                <p className="text-muted-foreground max-w-md">
                  {sampleError || "Could not find tracks to sample."}
                </p>
                {sampleError?.includes("SPOTIFY_CLIENT") && (
                  <div className="mt-4 text-left bg-secondary/50 rounded-lg p-4 max-w-md">
                    <p className="text-sm font-medium mb-2">Quick fix:</p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" className="text-primary underline">developer.spotify.com/dashboard</a></li>
                      <li>Create an app to get Client ID + Secret</li>
                      <li>Add them to <code className="bg-secondary px-1 rounded">.env.local</code></li>
                      <li>Restart the dev server</li>
                    </ol>
                  </div>
                )}
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" asChild>
                    <Link href="/settings">Settings</Link>
                  </Button>
                  <Button
                    onClick={() => setStep("preferences")}
                  >
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === "sampling" && currentSampleTrack && (
          <motion.div
            key="sampling"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <Progress
              value={(currentSample / sampleTracks.length) * 100}
            />
            <p className="text-sm text-muted-foreground text-center">
              Track {currentSample + 1} of {sampleTracks.length} ·{" "}
              {feedbackCount} rated
            </p>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentSampleTrack.id || currentSample}
                initial={{ opacity: 0, rotateY: 90 }}
                animate={{ opacity: 1, rotateY: 0 }}
                exit={{ opacity: 0, rotateY: -90 }}
                transition={{ duration: 0.3 }}
              >
                <Card>
                  <CardContent className="p-8 flex flex-col items-center">
                    <div className="w-64 h-64 rounded-lg bg-secondary flex items-center justify-center overflow-hidden mb-6">
                      {currentSampleTrack.coverPath ? (
                        <Image
                          src={currentSampleTrack.coverPath}
                          alt={currentSampleTrack.album || ""}
                          width={256}
                          height={256}
                          className="object-cover"
                        />
                      ) : (
                        <Music className="h-20 w-20 text-muted-foreground" />
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-center">
                      {currentSampleTrack.title}
                    </h2>
                    <p className="text-muted-foreground text-center">
                      {currentSampleTrack.artist}
                    </p>
                    {currentSampleTrack.album && (
                      <p className="text-sm text-muted-foreground">
                        {currentSampleTrack.album}
                      </p>
                    )}
                    {sampleSource === "spotify" && (
                      <Badge variant="secondary" className="mt-2">
                        Playing on Sonos via Spotify
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-center gap-4">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 max-w-[140px] h-16 text-lg"
                onClick={() => submitFeedback("bad")}
              >
                <ThumbsDown className="h-6 w-6 mr-2" />
                Nah
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="flex-1 max-w-[140px] h-16 text-lg"
                onClick={() => submitFeedback("ok")}
              >
                <Minus className="h-6 w-6 mr-2" />
                OK
              </Button>
              <Button
                variant="default"
                size="lg"
                className="flex-1 max-w-[140px] h-16 text-lg"
                onClick={() => submitFeedback("amazing")}
              >
                <Star className="h-6 w-6 mr-2" />
                Love
              </Button>
            </div>

            {feedbackCount >= 5 && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={generateProfile}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Profile Now ({feedbackCount} ratings)
              </Button>
            )}
          </motion.div>
        )}

        {step === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center py-16"
          >
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg">Analyzing your taste...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Claude is building your music profile
            </p>
          </motion.div>
        )}

        {step === "complete" && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Your Taste Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {profileText}
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setStep("preferences");
                  setFeedbackCount(0);
                  setCurrentSample(0);
                  setSessionId(null);
                }}
              >
                Start New Session
              </Button>
              <Button className="flex-1" asChild>
                <a href="/profile">View Full Profile</a>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
