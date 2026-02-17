"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/store/player";

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRecorded = useRef(false);
  const sonosPlayUriSent = useRef(false);
  const trackChangedAt = useRef(0);
  // Preview mode: "ending" = playing tail of track, "starting" = playing head of track
  const previewPhase = useRef<"ending" | "starting">("ending");
  const previewSeeked = useRef(false); // guard against double-seeking
  const {
    currentTrack,
    isPlaying,
    volume,
    outputTarget,
    sonosSpeaker,
    previewMode,
    previewDuration,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setVolume,
    playNext,
  } = usePlayerStore();
  const lastVolumeSentAt = useRef(0);

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
    previewSeeked.current = false; // reset for new track

    if (outputTarget === "browser" && (currentTrack.filePath || currentTrack.streamUrl)) {
      // DJ crossfade hook handles browser audio in preview mode
      if (previewMode) {
        audio.pause();
        audio.removeAttribute("src");
        return;
      }

      const audioUrl = currentTrack.filePath
        ? `/api/audio${currentTrack.filePath}`
        : currentTrack.streamUrl!;
      audio.src = audioUrl;
      audio.load();
      historyRecorded.current = false;

      if (isPlaying) {
        audio.play().catch(() => {});
      }
    } else if (outputTarget === "sonos" && sonosSpeaker) {
      // Stop browser audio — don't call load() after removing src as it fires error events
      audio.pause();
      audio.removeAttribute("src");

      // Send to Sonos via API
      const vynlHost = process.env.NEXT_PUBLIC_VYNL_HOST || window.location.origin;

      if (currentTrack.filePath) {
        // Encode path segments for Sonos (spaces/special chars must be percent-encoded)
        const encodedPath = currentTrack.filePath
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/");
        // Append ?sonos=1 to trigger server-side transcoding for lossless formats
        const sonosParam = currentTrack.filePath.match(/\.(flac|wav|aiff|alac)$/i)
          ? "?sonos=1"
          : "";
        sonosPlayUriSent.current = true;
        fetch("/api/sonos/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            speaker: sonosSpeaker,
            action: "play-uri",
            uri: `${vynlHost}/api/audio${encodedPath}${sonosParam}`,
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
  }, [currentTrack, outputTarget, sonosSpeaker, previewMode]);

  // Preview mode: seek immediately when toggled on mid-track (browser only)
  const prevPreviewMode = useRef(previewMode);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || outputTarget !== "browser") {
      prevPreviewMode.current = previewMode;
      return;
    }

    // Just toggled preview ON — seek to the ending of current track
    if (previewMode && !prevPreviewMode.current && audio.duration > 0) {
      previewPhase.current = "ending";
      const seekTo = Math.max(0, audio.duration - previewDuration);
      audio.currentTime = seekTo;
    }

    prevPreviewMode.current = previewMode;
  }, [previewMode, previewDuration, outputTarget]);

  // Handle play/pause (user-initiated toggle only)
  const prevIsPlaying = useRef(isPlaying);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    // Skip if isPlaying didn't actually change (e.g. initial render)
    if (prevIsPlaying.current === isPlaying) return;
    prevIsPlaying.current = isPlaying;

    if (outputTarget === "browser") {
      if (previewMode) return; // crossfade hook handles it
      if (isPlaying) {
        audio.play().catch(() => {});
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

        // Sync volume from Sonos (skip if we recently sent a volume change to avoid loop)
        if (data.volume !== undefined && Date.now() - lastVolumeSentAt.current > 3000) {
          const sonosVol = Number(data.volume) / 100;
          if (Math.abs(sonosVol - usePlayerStore.getState().volume) > 0.02) {
            setVolume(sonosVol);
          }
        }

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
  const prevVolume = useRef(volume);
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    // Send volume to Sonos when in Sonos mode
    if (outputTarget === "sonos" && sonosSpeaker && prevVolume.current !== volume) {
      lastVolumeSentAt.current = Date.now();
      const sonosVol = Math.round(volume * 100);
      fetch("/api/sonos/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker: sonosSpeaker, volume: sonosVol }),
      }).catch(() => {});
    }
    prevVolume.current = volume;
  }, [volume, outputTarget, sonosSpeaker]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // DJ crossfade hook handles all audio events in preview mode
    if (previewMode && outputTarget === "browser") return;

    let lastPositionSave = 0;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      // Preview mode: handle phase transitions (browser only)
      if (previewMode && outputTarget === "browser" && audio.duration > 0) {
        if (previewPhase.current === "starting") {
          // Playing head: after previewDuration seconds, seek to the ending
          if (audio.currentTime >= previewDuration) {
            previewPhase.current = "ending";
            previewSeeked.current = false;
            const seekTo = Math.max(0, audio.duration - previewDuration);
            audio.currentTime = seekTo;
          }
        }
        // "ending" phase: the 'ended' event handles advancing to next track
      }

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

      // Record to history after 30s of playback (skip in preview mode)
      if (!previewMode && audio.currentTime > 30 && !historyRecorded.current && currentTrack) {
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

      // Preview mode: seek to the ending segment on track load
      if (previewMode && outputTarget === "browser" && audio.duration > 0 && !previewSeeked.current) {
        if (previewPhase.current === "ending") {
          previewSeeked.current = true;
          const seekTo = Math.max(0, audio.duration - previewDuration);
          audio.currentTime = seekTo;
        }
        // "starting" phase: play from 0:00 (default), no seek needed
      }
    };

    // Also handle 'canplay' for preview seek — some browsers don't allow seeking on loadedmetadata
    const onCanPlay = () => {
      if (previewMode && outputTarget === "browser" && audio.duration > 0 && !previewSeeked.current) {
        if (previewPhase.current === "ending") {
          previewSeeked.current = true;
          const seekTo = Math.max(0, audio.duration - previewDuration);
          audio.currentTime = seekTo;
        }
      }
    };

    const onEnded = () => {
      // In preview mode, next track starts with its "starting" (head) phase
      if (previewMode) {
        previewPhase.current = "starting";
        previewSeeked.current = false;
      }
      playNext();
    };

    const onError = () => {
      // Only stop playback for browser mode — in Sonos mode, HTML5 Audio errors
      // are expected (no browser source for Spotify/radio tracks)
      const { outputTarget: currentOutput } = usePlayerStore.getState();
      if (currentOutput !== "browser") return;
      // Ignore errors when there's no source (e.g. initial state, source cleared)
      if (!audio.src || audio.src === window.location.href) return;
      console.warn("Audio playback error:", audio.error?.message || "unknown");
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [currentTrack, outputTarget, previewMode, previewDuration, setCurrentTime, setDuration, setIsPlaying, playNext]);

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
