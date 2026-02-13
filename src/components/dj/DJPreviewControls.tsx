// [VynlDJ] — extractable: Transition preview mode controls
// Preview = headphone mode: auto-switches to browser output so you hear
// transitions through your headphones/Mac speakers, not the Sonos in the room.
"use client";

import React, { useRef } from "react";
import { usePlayerStore, type OutputTarget } from "@/store/player";
import { Button } from "@/components/ui/button";
import { FastForward, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

const DURATION_OPTIONS = [5, 10, 15, 30] as const;

export function DJPreviewControls() {
  const {
    previewMode,
    previewDuration,
    outputTarget,
    setPreviewMode,
    setOutputTarget,
  } = usePlayerStore();

  // Remember what output was active before preview, so we can restore it
  const savedOutput = useRef<OutputTarget | null>(null);

  const togglePreview = () => {
    if (!previewMode) {
      // Entering preview: switch to browser (headphones) if on Sonos
      if (outputTarget === "sonos") {
        savedOutput.current = "sonos";
        setOutputTarget("browser");
      }
      setPreviewMode(true);
    } else {
      // Exiting preview: restore previous output
      setPreviewMode(false);
      if (savedOutput.current) {
        setOutputTarget(savedOutput.current);
        savedOutput.current = null;
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 text-xs gap-1.5",
          previewMode
            ? "text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20"
            : "text-white/50 hover:text-white hover:bg-white/10"
        )}
        onClick={togglePreview}
      >
        <FastForward className="h-3.5 w-3.5" />
        Preview
      </Button>

      {previewMode && (
        <>
          <div className="flex items-center gap-1">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setPreviewMode(true, d)}
                className={cn(
                  "px-2 py-0.5 rounded text-xs transition-colors",
                  d === previewDuration
                    ? "bg-amber-400/20 text-amber-400"
                    : "text-white/40 hover:text-white/60 hover:bg-white/5"
                )}
              >
                {d}s
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-amber-400/60 text-xs">
            <Headphones className="h-3 w-3" />
            <span>Headphones</span>
          </div>
        </>
      )}
    </div>
  );
}
