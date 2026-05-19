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
 * Full-screen one-shot celebration when the user crowns a track with the
 * fifth Vynl. A black vinyl with a purple label spins over the song
 * title for ~6 seconds. Click anywhere or wait for auto-dismiss.
 *
 * Rendered in a portal so it floats over any layout. The colour palette
 * intentionally mirrors the rest of Vynl's purple/pink neon (#a855f7,
 * #ec4899) — same as the splash screen and the Albums-page On-Air toggles.
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
      setTimeout(onClose, 400);
    }, durationMs);
    return () => clearTimeout(t);
  }, [durationMs, onClose]);

  if (!mounted) return null;

  const overlay = (
    <div
      onClick={() => {
        setLeaving(true);
        setTimeout(onClose, 400);
      }}
      className={
        "fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer " +
        "bg-black/85 backdrop-blur-sm transition-opacity duration-400 " +
        (leaving ? "opacity-0" : "opacity-100")
      }
    >
      {/* Glowing purple/pink backdrop wash. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            "radial-gradient(circle at center, rgba(168,85,247,0.5) 0%, rgba(236,72,153,0.2) 40%, transparent 70%)",
        }}
      />

      {/* The vinyl — black disc, purple label, spinning. */}
      <div className="relative w-64 h-64 mb-6">
        <div
          className="absolute inset-0 rounded-full bg-black"
          style={{
            animation: "spin 4s linear infinite",
            boxShadow:
              "0 0 60px rgba(168,85,247,0.6), 0 0 120px rgba(236,72,153,0.4), inset 0 0 30px rgba(0,0,0,0.8)",
          }}
        >
          {/* Concentric grooves. */}
          {[0.92, 0.84, 0.76, 0.68, 0.6].map((scale) => (
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
          {/* Purple label in the centre. */}
          <div
            className="absolute top-1/2 left-1/2 rounded-full flex items-center justify-center"
            style={{
              width: "40%",
              height: "40%",
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle at 35% 35%, #c084fc 0%, #a855f7 50%, #7e22ce 100%)",
              boxShadow: "0 0 20px rgba(168,85,247,0.8)",
            }}
          >
            <div
              className="rounded-full bg-black"
              style={{ width: "12%", height: "12%" }}
            />
          </div>
        </div>
      </div>

      {/* Track title. */}
      <div className="relative z-10 text-center px-6 max-w-2xl">
        <p className="text-xs uppercase tracking-[0.4em] text-[#ec4899] mb-3 font-semibold">
          5-Vynl Crown
        </p>
        <h2
          className="text-4xl md:text-5xl font-bold text-white mb-2 break-words"
          style={{
            textShadow:
              "0 0 20px rgba(168,85,247,0.8), 0 0 40px rgba(236,72,153,0.5)",
          }}
        >
          {trackTitle}
        </h2>
        {subtitle && (
          <p className="text-sm text-zinc-300 mb-4">{subtitle}</p>
        )}
        <p className="text-xs text-zinc-400 mt-6">
          Added to <b className="text-[#f0abfc]">All-Time Songs</b>
        </p>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
