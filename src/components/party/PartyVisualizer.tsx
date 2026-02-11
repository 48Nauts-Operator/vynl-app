"use client";

import React, { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/player";

export type VisualizerMode = "bars" | "wave" | "circles" | "particles";

interface PartyVisualizerProps {
  vizMode: VisualizerMode;
  className?: string;
}

export function PartyVisualizer({ vizMode, className = "" }: PartyVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<
    Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      hue: number;
      life: number;
    }>
  >([]);

  const { currentTrack } = usePlayerStore();

  // Connect to audio element
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
        // Already connected
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
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);

    const bufferLength = analyserRef.current?.frequencyBinCount || 128;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, w, h);

      const energy =
        dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);

      switch (vizMode) {
        case "bars":
          drawBars(ctx, dataArray, w, h, energy);
          break;
        case "wave":
          drawWave(ctx, dataArray, w, h, energy);
          break;
        case "circles":
          drawCircles(ctx, dataArray, w, h, energy);
          break;
        case "particles":
          drawParticles(ctx, dataArray, w, h, energy, particlesRef.current);
          break;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [vizMode]);

  return <canvas ref={canvasRef} className={`w-full h-full ${className}`} />;
}

// ---------- Visualizer draw functions ----------

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

    const hue = 260 + (i / barCount) * 120;
    const saturation = 70 + energy * 30;
    const lightness = 40 + val * 30;

    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    ctx.shadowBlur = val * 20;
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;

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

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`;
    ctx.fillRect(x, h - barHeight - barHeight * 0.3, barWidth, barHeight * 0.3);
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

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

      const y =
        centerY +
        offset +
        (layer - 1) * 40 +
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

  const glowRadius = maxRadius * (0.3 + energy * 0.5);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
  gradient.addColorStop(
    0,
    `hsla(${280 + energy * 60}, 100%, 60%, ${0.3 + energy * 0.3})`
  );
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

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

function drawParticles(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  w: number,
  h: number,
  energy: number,
  particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    hue: number;
    life: number;
  }>
) {
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

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
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
