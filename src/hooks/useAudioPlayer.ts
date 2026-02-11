"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/store/player";

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRecorded = useRef(false);
  const sonosPlayUriSent = useRef(false);
  const trackChangedAt = useRef(0);
  const {
    currentTrack,
    isPlaying,
    volume,
    outputTarget,
    sonosSpeaker,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    playNext,
  } = usePlayerStore();

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "metadata";
    }
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Handle track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    trackChangedAt.current = Date.now();

    if (outputTarget === "browser" && (currentTrack.filePath || currentTrack.streamUrl)) {
      const audioUrl = currentTrack.filePath
        ? `/api/audio${currentTrack.filePath}`
        : currentTrack.streamUrl!;
      audio.src = audioUrl;
      audio.load();
      historyRecorded.current = false;

      if (isPlaying) {
        audio.play().catch(console.error);
      }
    } else if (outputTarget === "sonos" && sonosSpeaker) {
      // Stop browser audio and clear source to prevent error events
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      // Send to Sonos via API
      const vynlHost = process.env.NEXT_PUBLIC_VYNL_HOST || window.location.origin;

      if (currentTrack.filePath) {
        // Encode path segments for Sonos (spaces/special chars must be percent-encoded)
        const encodedPath = currentTrack.filePath
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/");
        sonosPlayUriSent.current = true;
        fetch("/api/sonos/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speaker: sonosSpeaker,
            action: "play-uri",
            uri: `${vynlHost}/api/audio${encodedPath}`,
          }),
        }).catch(console.error);
      } else if (currentTrack.sourceId && currentTrack.source === "spotify") {
        // Spotify tracks are played directly by the caller (discover page, search, etc.)
        // — not by this hook, to avoid duplicate commands and 500 errors
      } else if (currentTrack.streamUrl) {
        fetch("/api/sonos/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speaker: sonosSpeaker,
            action: "play-uri",
            uri: currentTrack.streamUrl,
            isRadio: currentTrack.source === "radio",
          }),
        }).catch(console.error);
      }
    }
  }, [currentTrack, outputTarget, sonosSpeaker]);

  // Handle play/pause (user-initiated toggle only)
  const prevIsPlaying = useRef(isPlaying);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    // Skip if isPlaying didn't actually change (e.g. initial render)
    if (prevIsPlaying.current === isPlaying) return;
    prevIsPlaying.current = isPlaying;

    if (outputTarget === "browser") {
      if (isPlaying) {
        audio.play().catch(console.error);
      } else {
        audio.pause();
      }
    } else if (outputTarget === "sonos" && sonosSpeaker) {
      // Skip if play-uri was just sent (it already starts playback)
      if (sonosPlayUriSent.current && isPlaying) {
        sonosPlayUriSent.current = false;
        return;
      }
      sonosPlayUriSent.current = false;
      fetch("/api/sonos/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speaker: sonosSpeaker,
          action: isPlaying ? "play" : "pause",
        }),
      }).catch(console.error);
    }
  }, [isPlaying, currentTrack, outputTarget, sonosSpeaker]);

  // Poll Sonos status for playback position
  useEffect(() => {
    if (outputTarget !== "sonos" || !sonosSpeaker || !currentTrack) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/sonos/status?speaker=${encodeURIComponent(sonosSpeaker)}`);
        if (!res.ok) return;
        const data = await res.json();

        // Parse time strings like "0:01:23" to seconds
        const parseTime = (t: string | undefined): number => {
          if (!t) return 0;
          const parts = t.split(":").map(Number);
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          return parts[0] || 0;
        };

        const position = parseTime(data.position);
        const duration = parseTime(data.duration);

        if (duration > 0) setDuration(duration);
        setCurrentTime(position);

        // Detect if Sonos stopped (track ended)
        // Skip detection within 5s of a track change to avoid race with play-uri
        const sinceTrackChange = Date.now() - trackChangedAt.current;
        if (data.state === "STOPPED" && position === 0 && isPlaying && sinceTrackChange > 5000) {
          playNext();
        }
      } catch {
        // Polling error, ignore
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [outputTarget, sonosSpeaker, currentTrack, isPlaying, setCurrentTime, setDuration, playNext]);

  // Handle volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let lastPositionSave = 0;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // Save podcast play position every 30 seconds
      if (
        currentTrack?.source === "podcast" &&
        currentTrack.podcastEpisodeId &&
        audio.currentTime > 0 &&
        Math.floor(audio.currentTime) - lastPositionSave >= 30
      ) {
        lastPositionSave = Math.floor(audio.currentTime);
        fetch(`/api/podcasts/0/episodes/${currentTrack.podcastEpisodeId}/position`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: audio.currentTime }),
        }).catch(() => {});
      }

      // Record to history after 30s of playback
      if (audio.currentTime > 30 && !historyRecorded.current && currentTrack) {
        historyRecorded.current = true;
        fetch("/api/library/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackId: currentTrack.id,
            trackTitle: currentTrack.title,
            trackArtist: currentTrack.artist,
            source: currentTrack.source,
            duration: currentTrack.duration,
            listenedDuration: audio.currentTime,
            outputTarget,
          }),
        }).catch(console.error);
      }
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const onEnded = () => {
      playNext();
    };

    const onError = () => {
      // Only stop playback for browser mode — in Sonos mode, HTML5 Audio errors
      // are expected (no browser source for Spotify/radio tracks)
      const { outputTarget: currentOutput } = usePlayerStore.getState();
      if (currentOutput === "browser") {
        console.error("Audio playback error");
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [currentTrack, outputTarget, setCurrentTime, setDuration, setIsPlaying, playNext]);

  const seek = useCallback(
    (time: number) => {
      if (audioRef.current && outputTarget === "browser") {
        audioRef.current.currentTime = time;
        setCurrentTime(time);
      }
    },
    [outputTarget, setCurrentTime]
  );

  return { audioRef, seek };
}
