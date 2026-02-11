"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePlayerStore } from "@/store/player";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Maximize,
  Minimize,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatDuration } from "@/lib/utils";

type VisualizerMode = "bars" | "wave" | "circles" | "particles";

export default function PartyPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [vizMode, setVisualizerMode] = useState<VisualizerMode>("bars");
  const controlsTimeout = useRef<NodeJS.Timeout>(null);
  const particlesRef = useRef<Array<{x: number; y: number; vx: number; vy: number; size: number; hue: number; life: number}>>([]);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    playNext,
    playPrev,
  } = usePlayerStore();

  // Mouse movement shows controls temporarily
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Connect to audio element for visualization
  useEffect(() => {
    const audio = document.querySelector("audio");
    if (!audio) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audio);
        sourceRef.current.connect(ctx.destination);
      } catch {
        // Already connected — this is fine
      }
    }

    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      if (sourceRef.current) {
        sourceRef.current.connect(analyserRef.current);
      }
    }
  }, [currentTrack]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const bufferLength = analyserRef.current?.frequencyBinCount || 128;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const { width, height } = canvas;

      // Get frequency data
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      // Background with fade
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, width, height);

      // Calculate overall energy for effects
      const energy =
        dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);

      switch (vizMode) {
        case "bars":
          drawBars(ctx, dataArray, width, height, energy);
          break;
        case "wave":
          drawWave(ctx, dataArray, width, height, energy);
          break;
        case "circles":
          drawCircles(ctx, dataArray, width, height, energy);
          break;
        case "particles":
          drawParticles(ctx, dataArray, width, height, energy);
          break;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [vizMode]);

  // Visualizer: Bars
  function drawBars(
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    w: number,
    h: number,
    energy: number
  ) {
    const barCount = 64;
    const barWidth = w / barCount - 2;
    const step = Math.floor(data.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const val = data[i * step] / 255;
      const barHeight = val * h * 0.8;
      const x = i * (barWidth + 2);
      const y = h - barHeight;

      // Gradient from purple to cyan based on frequency
      const hue = 260 + (i / barCount) * 120;
      const saturation = 70 + energy * 30;
      const lightness = 40 + val * 30;

      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.shadowBlur = val * 20;
      ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;

      // Rounded top bars
      const radius = Math.min(barWidth / 2, 4);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, h);
      ctx.lineTo(x, h);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();

      // Mirror on top (reflection)
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`;
      ctx.fillRect(x, h - barHeight - barHeight * 0.3, barWidth, barHeight * 0.3);
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }

  // Visualizer: Wave
  function drawWave(
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    w: number,
    h: number,
    energy: number
  ) {
    const centerY = h / 2;
    const timeOffset = Date.now() / 1000;

    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const hue = 200 + layer * 60;

      for (let i = 0; i <= w; i += 2) {
        const dataIndex = Math.floor((i / w) * data.length);
        const val = data[dataIndex] / 255;
        const waveHeight = val * h * 0.3 * (1 + energy);
        const offset = Math.sin(i * 0.01 + timeOffset * (2 + layer)) * 30;

        const y = centerY + offset + (layer - 1) * 40 +
          Math.sin(i * 0.02 + timeOffset * 3) * waveHeight;

        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }

      ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${0.6 - layer * 0.15})`;
      ctx.lineWidth = 3 - layer * 0.5;
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.5)`;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // Visualizer: Circles
  function drawCircles(
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    w: number,
    h: number,
    energy: number
  ) {
    const cx = w / 2;
    const cy = h / 2;
    const time = Date.now() / 1000;
    const maxRadius = Math.min(w, h) * 0.35;

    // Pulsing central glow
    const glowRadius = maxRadius * (0.3 + energy * 0.5);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    gradient.addColorStop(0, `hsla(${280 + energy * 60}, 100%, 60%, ${0.3 + energy * 0.3})`);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Frequency circles
    const ringCount = 32;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2 + time * 0.5;
      const dataIndex = Math.floor((i / ringCount) * data.length);
      const val = data[dataIndex] / 255;
      const radius = maxRadius * 0.5 + val * maxRadius * 0.5;
      const dotRadius = 3 + val * 12;

      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      const hue = (i / ringCount) * 360;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, ${50 + val * 30}%, ${0.7 + val * 0.3})`;
      ctx.shadowBlur = val * 25;
      ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.8)`;
      ctx.fill();

      // Connection lines
      if (val > 0.4) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `hsla(${hue}, 80%, 60%, ${val * 0.3})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }

  // Visualizer: Particles
  function drawParticles(
    ctx: CanvasRenderingContext2D,
    data: Uint8Array,
    w: number,
    h: number,
    energy: number
  ) {
    const particles = particlesRef.current;

    // Spawn new particles based on energy
    const spawnCount = Math.floor(energy * 8);
    for (let i = 0; i < spawnCount && particles.length < 300; i++) {
      const dataIndex = Math.floor(Math.random() * data.length);
      const val = data[dataIndex] / 255;
      if (val < 0.2) continue;

      particles.push({
        x: w / 2 + (Math.random() - 0.5) * 100,
        y: h / 2 + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * val * 8,
        vy: (Math.random() - 0.5) * val * 8 - val * 3,
        size: 2 + val * 6,
        hue: 200 + Math.random() * 160,
        life: 1,
      });
    }

    // Update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life -= 0.008;
      p.size *= 0.998;

      if (p.life <= 0 || p.x < -10 || p.x > w + 10 || p.y > h + 10) {
        particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.life * 0.8})`;
      ctx.shadowBlur = p.size * 3;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${p.life * 0.5})`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Cycle through visualizer modes
  const vizModes: VisualizerMode[] = ["bars", "wave", "circles", "particles"];
  const cycleViz = () => {
    setVisualizerMode((prev) => {
      const idx = vizModes.indexOf(prev);
      return vizModes[(idx + 1) % vizModes.length];
    });
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black cursor-none"
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      {/* Visualizer Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onClick={cycleViz}
      />

      {/* Album Art (centered, semi-transparent) */}
      {currentTrack?.coverPath && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-64 h-64 rounded-2xl overflow-hidden shadow-2xl transition-transform duration-500"
            style={{
              opacity: 0.15,
              transform: isPlaying ? "scale(1.05)" : "scale(1)",
            }}
          >
            <Image
              src={currentTrack.coverPath}
              alt=""
              width={256}
              height={256}
              className="object-cover w-full h-full"
            />
          </div>
        </div>
      )}

      {/* Track Info (bottom center) */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-500 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div className="w-full h-1 bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between px-8 py-6">
          {/* Track info */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {currentTrack?.coverPath && (
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 shadow-lg">
                <Image
                  src={currentTrack.coverPath}
                  alt=""
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-xl font-bold truncate">
                {currentTrack?.title || "No track playing"}
              </p>
              <p className="text-white/60 truncate">
                {currentTrack?.artist || "Play a track to start the party"}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
              onClick={playPrev}
            >
              <SkipBack className="h-6 w-6" />
            </Button>
            <Button
              size="icon"
              className="h-14 w-14 rounded-full bg-white text-black hover:bg-white/90"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
              onClick={playNext}
            >
              <SkipForward className="h-6 w-6" />
            </Button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <span className="text-white/50 text-sm">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10 text-xs uppercase tracking-wider"
              onClick={cycleViz}
            >
              {vizMode}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/60 hover:text-white hover:bg-white/10"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </Button>
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-white/60 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
