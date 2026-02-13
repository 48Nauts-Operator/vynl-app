"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import type { LyricLine } from "@/hooks/useLyrics";

interface LyricsDisplayProps {
  lines: LyricLine[];
  plainText?: string;
  format: "lrc" | "plain" | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

export function LyricsDisplay({
  lines,
  plainText,
  format,
  currentTime,
  duration,
  isPlaying,
}: LyricsDisplayProps) {
  // Smooth time interpolation for Sonos 2s poll gap
  const [smoothTime, setSmoothTime] = useState(currentTime);
  const lastUpdateRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setSmoothTime(currentTime);
    lastUpdateRef.current = Date.now();
  }, [currentTime]);

  useEffect(() => {
    if (!isPlaying || format !== "lrc") return;
    const frame = () => {
      const elapsed = (Date.now() - lastUpdateRef.current) / 1000;
      setSmoothTime(currentTime + elapsed);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [currentTime, isPlaying, format]);

  // Find active line index via binary search
  const activeIndex = useMemo(() => {
    if (format !== "lrc" || lines.length === 0) return -1;
    let lo = 0;
    let hi = lines.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].time <= smoothTime) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }, [lines, smoothTime, format]);

  if (format === "lrc" && lines.length > 0) {
    return <SyncedLyrics lines={lines} activeIndex={activeIndex} />;
  }

  if (plainText) {
    return (
      <PlainLyrics
        text={plainText}
        currentTime={currentTime}
        duration={duration}
      />
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-white/30 text-2xl italic">No lyrics available</p>
    </div>
  );
}

function SyncedLyrics({
  lines,
  activeIndex,
}: {
  lines: LyricLine[];
  activeIndex: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [offset, setOffset] = useState(0);

  // Measure and calculate offset to center the active line
  const updateOffset = useCallback(() => {
    if (!containerRef.current || activeIndex < 0) return;
    const container = containerRef.current;
    const activeLine = lineRefs.current[activeIndex];
    if (!activeLine) return;

    const containerHeight = container.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineHeight = activeLine.clientHeight;

    // Move the content so the active line sits at vertical center
    setOffset(-(lineTop - containerHeight / 2 + lineHeight / 2));
  }, [activeIndex]);

  useEffect(() => {
    updateOffset();
  }, [updateOffset]);

  // Re-measure on resize
  useEffect(() => {
    window.addEventListener("resize", updateOffset);
    return () => window.removeEventListener("resize", updateOffset);
  }, [updateOffset]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden relative"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
      }}
    >
      <motion.div
        animate={{ y: offset }}
        transition={{ type: "spring", stiffness: 80, damping: 20 }}
        className="pt-[50%] pb-[50%] px-8 space-y-6 text-center"
      >
        {lines.map((line, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;
          const isInstrumental = !line.text;

          return (
            <motion.div
              key={i}
              ref={(el) => { lineRefs.current[i] = el; }}
              animate={{
                opacity: isActive ? 1 : isPast ? 0.25 : 0.4,
                scale: isActive ? 1 : 0.92,
              }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
              className="leading-relaxed"
            >
              {isInstrumental ? (
                <span className="text-white/20 text-lg">- - -</span>
              ) : (
                <span
                  className={
                    isActive
                      ? "text-4xl font-bold text-white"
                      : "text-2xl font-light text-white"
                  }
                  style={
                    isActive
                      ? { textShadow: "0 0 40px rgba(168, 85, 247, 0.5)" }
                      : undefined
                  }
                >
                  {line.text}
                </span>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function PlainLyrics({
  text,
  currentTime,
  duration,
}: {
  text: string;
  currentTime: number;
  duration: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !innerRef.current || duration <= 0) return;
    const progress = currentTime / duration;
    const containerHeight = containerRef.current.clientHeight;
    const contentHeight = innerRef.current.scrollHeight;
    const maxOffset = contentHeight - containerHeight;
    if (maxOffset <= 0) return;

    setOffset(-(progress * maxOffset));
  }, [currentTime, duration]);

  const paragraphs = text.split("\n");

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden relative"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
      }}
    >
      <motion.div
        ref={innerRef}
        animate={{ y: offset }}
        transition={{ type: "spring", stiffness: 80, damping: 20 }}
        className="pt-[40%] pb-[40%] px-8 text-center space-y-4"
      >
        {paragraphs.map((line, i) => (
          <p key={i} className="text-2xl text-white/60 font-light leading-relaxed">
            {line || "\u00A0"}
          </p>
        ))}
      </motion.div>
    </div>
  );
}
