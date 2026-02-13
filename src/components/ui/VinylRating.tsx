"use client";

import React, { useState } from "react";
import { Disc3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VinylRatingProps {
  rating: number | null;
  onChange?: (rating: number) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
  label?: string;
}

export function VinylRating({
  rating,
  onChange,
  size = "md",
  readOnly = false,
  label,
}: VinylRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const gap = size === "sm" ? "gap-0.5" : "gap-1";

  const displayRating = hoverRating || rating || 0;

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
              filled ? "text-amber-400" : "text-zinc-600"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!readOnly && onChange) onChange(value);
            }}
            onMouseEnter={() => !readOnly && setHoverRating(value)}
            onMouseLeave={() => !readOnly && setHoverRating(0)}
          >
            <Disc3 className={cn(iconSize, filled && "drop-shadow-[0_0_3px_rgba(251,191,36,0.5)]")} />
          </button>
        );
      })}
      {label && (
        <span className="text-xs text-muted-foreground ml-1">{label}</span>
      )}
    </div>
  );
}
