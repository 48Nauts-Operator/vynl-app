"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface FiveStarCelebrationProps {
  /** Track title to display in the centre. */
  trackTitle: string;
  /** Optional secondary line (artist, album). */
  subtitle?: string;
  /** How long the overlay stays on screen, in ms. Default 6000. */
  durationMs?: number;
  /** Called when the overlay closes (auto or click-to-dismiss). */
  onClose: () => void;
}

/**
 * Minimal celebration when the user crowns a track with the fifth Vynl.
 * A spinning vinyl sits at the centre of a dark backdrop under a soft
 * purple spotlight. As the duration progresses the spotlight blooms,
 * the room "lights up", and the overlay fades out. Click anywhere or
 * wait for auto-dismiss.
 *
 * Colour palette matches the splash screen and Albums On-Air toggles
 * (purple #a855f7 + pink #ec4899).
 */
export function FiveStarCelebration({
  trackTitle,
  subtitle,
  durationMs = 6000,
  onClose,
}: FiveStarCelebrationProps) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(onClose, 500);
    }, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, onClose]);

  if (!mounted) return null;

  const overlay = (
    <div
      onClick={() => {
        setLeaving(true);
        setTimeout(onClose, 500);
      }}
      className={
        "fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer " +
        "transition-opacity duration-500 " +
        (leaving ? "opacity-0" : "opacity-100")
      }
      style={{ background: "#000" }}
    >
      {/* Spotlight beam — starts dim, blooms wide near the end. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(168,85,247,0.5) 0%, rgba(168,85,247,0.15) 25%, rgba(0,0,0,0.85) 60%, #000 100%)",
          animation: "vynl-spotlight 6s ease-in-out forwards",
        }}
      />

      {/* The vinyl, dead centre. */}
      <div className="relative w-72 h-72 z-10">
        <div
          className="absolute inset-0 rounded-full bg-black"
          style={{
            animation: "spin 3s linear infinite",
            boxShadow:
              "0 0 60px rgba(168,85,247,0.55), 0 0 120px rgba(236,72,153,0.3), inset 0 0 30px rgba(0,0,0,0.9)",
          }}
        >
          {/* Concentric grooves. */}
          {[0.94, 0.86, 0.78, 0.70, 0.62, 0.54].map((scale) => (
            <div
              key={scale}
              className="absolute top-1/2 left-1/2 rounded-full border border-zinc-800/60"
              style={{
                width: `${scale * 100}%`,
                height: `${scale * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
          {/* Purple label. */}
          <div
            className="absolute top-1/2 left-1/2 rounded-full flex items-center justify-center"
            style={{
              width: "40%",
              height: "40%",
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle at 35% 35%, #f0abfc 0%, #a855f7 50%, #7e22ce 100%)",
              boxShadow: "0 0 30px rgba(168,85,247,0.9)",
            }}
          >
            <span
              className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/95"
              style={{ textShadow: "0 0 4px rgba(0,0,0,0.7)" }}
            >
              VYNL
            </span>
            <div
              className="absolute rounded-full bg-black"
              style={{
                width: "10%",
                height: "10%",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Track title — fades in after the vinyl establishes itself. */}
      <div
        className="relative z-10 text-center px-6 max-w-2xl mt-8"
        style={{ animation: "vynl-title 6s ease-in-out forwards" }}
      >
        <p className="text-xs uppercase tracking-[0.5em] text-[#ec4899] mb-3 font-semibold">
          5-Vynl Crown
        </p>
        <h2
          className="text-4xl md:text-5xl font-bold text-white mb-2 break-words"
          style={{
            textShadow:
              "0 0 20px rgba(168,85,247,0.85), 0 0 40px rgba(236,72,153,0.45)",
          }}
        >
          {trackTitle}
        </h2>
        {subtitle && (
          <p className="text-sm text-zinc-300/90">{subtitle}</p>
        )}
        <p className="text-xs text-zinc-400 mt-6">
          Added to <b className="text-[#f0abfc]">All-Time Songs</b>
        </p>
      </div>

      {/* Inline keyframes — kept local, no globals.css edits. */}
      <style jsx>{`
        @keyframes vynl-spotlight {
          0% {
            opacity: 0;
          }
          15% {
            opacity: 0.6;
          }
          70% {
            opacity: 1;
            background-size: 100% 100%;
          }
          85% {
            opacity: 1;
            filter: brightness(1.4) saturate(1.3);
          }
          100% {
            opacity: 1;
            filter: brightness(2) saturate(1.6);
          }
        }
        @keyframes vynl-title {
          0%, 15% {
            opacity: 0;
            transform: translateY(8px);
          }
          30% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}
