"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

interface FiveStarCelebrationProps {
  /** Track title to display in the centre. */
  trackTitle: string;
  /** Optional secondary line (artist, album). */
  subtitle?: string;
  /** How long the overlay stays on screen, in ms. Default 7000. */
  durationMs?: number;
  /** Called when the overlay closes (auto or click-to-dismiss). */
  onClose: () => void;
}

/**
 * Full-screen one-shot celebration when the user crowns a track with the
 * fifth Vynl. Renders a CSS turntable with a spinning vinyl, the Vynl
 * DJ logo bopping above, and the song title with a neon glow. Click
 * anywhere or wait for auto-dismiss (~7s).
 *
 * Colour palette mirrors the splash screen and Albums-page On-Air
 * toggles: purple (#a855f7) + pink (#ec4899).
 */
export function FiveStarCelebration({
  trackTitle,
  subtitle,
  durationMs = 7000,
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
        "bg-black/90 backdrop-blur-sm transition-opacity duration-400 " +
        (leaving ? "opacity-0" : "opacity-100")
      }
    >
      {/* Glowing purple/pink backdrop wash. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          background:
            "radial-gradient(circle at center, rgba(168,85,247,0.5) 0%, rgba(236,72,153,0.25) 40%, transparent 70%)",
        }}
      />

      {/* DJ logo bopping above the turntable. */}
      <div
        className="relative mb-6 z-10"
        style={{ animation: "vynl-bop 0.6s ease-in-out infinite" }}
      >
        <Image
          src="/logo-main.png"
          alt="Vynl DJ"
          width={180}
          height={200}
          priority
          className="drop-shadow-[0_0_30px_rgba(168,85,247,0.7)]"
        />
      </div>

      {/* CSS turntable. */}
      <div className="relative w-[420px] h-[300px] mb-6 z-10">
        {/* Deck body. */}
        <div
          className="absolute inset-0 rounded-[24px]"
          style={{
            background:
              "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 60%, #050505 100%)",
            boxShadow:
              "0 30px 60px rgba(0,0,0,0.7), 0 0 80px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
            border: "1px solid rgba(168,85,247,0.3)",
          }}
        />

        {/* Pitch slider (left side, decorative). */}
        <div
          className="absolute left-6 top-1/2 -translate-y-1/2 w-2 h-32 rounded-full"
          style={{
            background:
              "linear-gradient(180deg, rgba(168,85,247,0.4) 0%, rgba(60,60,60,0.6) 50%, rgba(236,72,153,0.4) 100%)",
            boxShadow: "inset 0 0 4px rgba(0,0,0,0.6)",
          }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 w-5 h-3 rounded-sm bg-zinc-200"
            style={{ top: "48%", boxShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
          />
        </div>

        {/* Strobe LEDs at top. */}
        <div className="absolute top-3 left-0 right-0 flex justify-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#ec4899]"
              style={{
                animation: `vynl-strobe 0.4s linear infinite`,
                animationDelay: `${i * 0.08}s`,
                boxShadow: "0 0 6px #ec4899",
              }}
            />
          ))}
        </div>

        {/* The platter + vinyl. */}
        <div
          className="absolute top-1/2 left-1/2 w-56 h-56 rounded-full"
          style={{
            transform: "translate(-50%, -50%) translateX(20px)",
            background:
              "radial-gradient(circle, #1a1a1a 0%, #050505 95%)",
            boxShadow:
              "inset 0 0 20px rgba(0,0,0,0.9), 0 0 30px rgba(168,85,247,0.4)",
          }}
        >
          {/* The spinning vinyl on the platter. */}
          <div
            className="absolute inset-2 rounded-full bg-black"
            style={{
              animation: "spin 2.5s linear infinite",
              boxShadow:
                "0 0 40px rgba(168,85,247,0.6), inset 0 0 20px rgba(0,0,0,0.8)",
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
                width: "44%",
                height: "44%",
                transform: "translate(-50%, -50%)",
                background:
                  "radial-gradient(circle at 35% 35%, #f0abfc 0%, #a855f7 45%, #7e22ce 100%)",
                boxShadow: "0 0 25px rgba(168,85,247,0.9)",
              }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-widest text-white/90"
                style={{ textShadow: "0 0 4px rgba(0,0,0,0.6)" }}
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

        {/* Tonearm. Pivots from top-right, needle hovers over the vinyl. */}
        <div
          className="absolute"
          style={{
            top: "32px",
            right: "44px",
            width: "130px",
            height: "8px",
            transformOrigin: "right center",
            animation: "vynl-tonearm 0.8s ease-out forwards",
          }}
        >
          {/* Pivot housing. */}
          <div
            className="absolute -right-2 -top-3 w-8 h-8 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, #555 0%, #222 70%)",
              boxShadow: "0 2px 4px rgba(0,0,0,0.6)",
            }}
          />
          {/* Arm. */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "linear-gradient(180deg, #888 0%, #555 50%, #333 100%)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          />
          {/* Cartridge at the head. */}
          <div
            className="absolute -left-1 -top-1 w-4 h-3 rounded-sm"
            style={{
              background:
                "linear-gradient(180deg, #ec4899 0%, #a855f7 100%)",
              boxShadow: "0 0 8px rgba(236,72,153,0.6)",
            }}
          />
        </div>
      </div>

      {/* Track title. */}
      <div className="relative z-10 text-center px-6 max-w-2xl">
        <p
          className="text-xs uppercase tracking-[0.5em] text-[#ec4899] mb-3 font-semibold"
          style={{ animation: "vynl-pulse 1.5s ease-in-out infinite" }}
        >
          5-Vynl Crown
        </p>
        <h2
          className="text-4xl md:text-5xl font-bold text-white mb-2 break-words"
          style={{
            textShadow:
              "0 0 20px rgba(168,85,247,0.9), 0 0 40px rgba(236,72,153,0.5)",
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

      {/* Inline keyframes — kept local so we don't need to touch globals.css. */}
      <style jsx>{`
        @keyframes vynl-bop {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-8px) rotate(2deg); }
        }
        @keyframes vynl-strobe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }
        @keyframes vynl-tonearm {
          0% { transform: rotate(-30deg); }
          100% { transform: rotate(15deg); }
        }
        @keyframes vynl-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}
