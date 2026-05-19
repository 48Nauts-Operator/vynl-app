"use client";

import React, { useState } from "react";
import { Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FiveStarCelebration } from "./FiveStarCelebration";
import { useSettingsStore } from "@/store/settings";

interface VinylRatingProps {
  rating: number | null;
  onChange?: (rating: number) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
  label?: string;
  /** When provided, a hidden purple vynl appears once the rating is 5.
   *  Clicking it adds this trackId to the All-Time Songs playlist and
   *  triggers the celebration overlay (unless disabled in settings). */
  trackId?: number;
  /** Track title shown in the celebration overlay. */
  trackTitle?: string;
  /** Optional subtitle (artist, album) for the overlay. */
  trackSubtitle?: string;
}

export function VinylRating({
  rating,
  onChange,
  size = "md",
  readOnly = false,
  label,
  trackId,
  trackTitle,
  trackSubtitle,
}: VinylRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [crowned, setCrowned] = useState(false); // golden -> purple swap
  const [adding, setAdding] = useState(false);
  const celebrateEnabled = useSettingsStore(
    (s) => s.ui?.celebrateFiveStar ?? true
  );
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const gap = size === "sm" ? "gap-0.5" : "gap-1";

  const displayRating = hoverRating || rating || 0;
  const isFiveStarred = (rating ?? 0) >= 5;
  const showCrownButton = isFiveStarred && !readOnly && trackId !== undefined;

  const filledColour = crowned
    ? "text-[#a855f7]"
    : "text-amber-400";
  const filledGlow = crowned
    ? "drop-shadow-[0_0_4px_rgba(168,85,247,0.7)]"
    : "drop-shadow-[0_0_3px_rgba(251,191,36,0.5)]";

  const handleCrown = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!trackId || adding) return;
    setAdding(true);
    setCrowned(true);
    try {
      // Fire-and-forget; failure shouldn't block the celebration.
      await fetch("/api/playlists/all-time-songs/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
    } catch (err) {
      console.error("All-Time Songs add failed:", err);
    } finally {
      setAdding(false);
    }
    if (celebrateEnabled) {
      setCelebrating(true);
    }
  };

  return (
    <div className={cn("flex items-center", gap)}>
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = value <= displayRating;
        return (
          <button
            key={value}
            type="button"
            disabled={readOnly}
            className={cn(
              "transition-colors focus:outline-none",
              readOnly ? "cursor-default" : "cursor-pointer hover:scale-110 transition-transform",
              filled ? filledColour : "text-zinc-600"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!readOnly && onChange) {
                // Toggling off via re-click of the current rating: revert
                // the crowned-swap so it can be re-triggered later.
                if (value < 5 && crowned) setCrowned(false);
                onChange(value);
              }
            }}
            onMouseEnter={() => !readOnly && setHoverRating(value)}
            onMouseLeave={() => !readOnly && setHoverRating(0)}
          >
            <Disc3 className={cn(iconSize, filled && filledGlow)} />
          </button>
        );
      })}
      {showCrownButton && (
        <button
          type="button"
          onClick={handleCrown}
          disabled={adding}
          aria-label="Crown this track — add to All-Time Songs"
          title={
            celebrateEnabled
              ? "Crown this track — add to All-Time Songs"
              : "Add to All-Time Songs"
          }
          className={cn(
            "ml-2 transition-all focus:outline-none cursor-pointer",
            "opacity-0 hover:opacity-100 group-hover:opacity-100",
            // Always-visible at 30% opacity if the song is 5-starred so
            // the user discovers the affordance without needing to hover
            // the row.
            "opacity-30",
            "text-[#a855f7] hover:scale-125",
            adding && "animate-pulse"
          )}
        >
          <Disc3
            className={cn(
              iconSize,
              "drop-shadow-[0_0_6px_rgba(168,85,247,0.7)]"
            )}
          />
        </button>
      )}
      {label && (
        <span className="text-xs text-muted-foreground ml-1">{label}</span>
      )}
      {celebrating && trackTitle && (
        <FiveStarCelebration
          trackTitle={trackTitle}
          subtitle={trackSubtitle}
          onClose={() => setCelebrating(false)}
        />
      )}
    </div>
  );
}
