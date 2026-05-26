"use client";

/**
 * Small, dismissible "give us a star on GitHub" prompt. Shows in the
 * bottom-right after the user has opened Vynl a few times. Three actions:
 *   - Star on GitHub  → opens repo + marks done forever
 *   - Maybe later     → snoozes for 14 days
 *   - No thanks       → permanent dismiss
 *
 * State stored in localStorage (per-user-browser, not per-server). The
 * keys live under the `vynl-star-*` namespace so they're easy to grep.
 */
import { useEffect, useState } from "react";
import { Star, X, Github } from "lucide-react";

const REPO_URL = "https://github.com/48Nauts-Operator/vynl-app";

const KEY_SESSIONS = "vynl-star-sessions";
const KEY_STATE = "vynl-star-state"; // "shown" | "snoozed" | "starred" | "dismissed"
const KEY_SNOOZE_UNTIL = "vynl-star-snooze-until";

// Show after this many opens
const MIN_SESSIONS = 5;
// Re-show this many days after "Maybe later"
const SNOOZE_DAYS = 14;
// Wait this long before showing on the very first qualifying session
const APPEAR_DELAY_MS = 8_000;

type State = "shown" | "snoozed" | "starred" | "dismissed" | null;

function readState(): State {
  try {
    return (localStorage.getItem(KEY_STATE) as State) || null;
  } catch {
    return null;
  }
}

function bumpSessionCount(): number {
  try {
    const raw = parseInt(localStorage.getItem(KEY_SESSIONS) || "0", 10) || 0;
    const next = raw + 1;
    localStorage.setItem(KEY_SESSIONS, String(next));
    return next;
  } catch {
    return 0;
  }
}

function snoozeUntil(): number {
  try {
    return parseInt(localStorage.getItem(KEY_SNOOZE_UNTIL) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function setStarState(s: State, snoozeMs?: number) {
  try {
    if (s) localStorage.setItem(KEY_STATE, s);
    if (snoozeMs) localStorage.setItem(KEY_SNOOZE_UNTIL, String(Date.now() + snoozeMs));
  } catch {}
}

export function StarPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sessions = bumpSessionCount();
    const state = readState();

    // Permanent stops
    if (state === "starred" || state === "dismissed") return;

    // Snooze check
    if (state === "snoozed" && Date.now() < snoozeUntil()) return;

    if (sessions < MIN_SESSIONS) return;

    const t = setTimeout(() => setVisible(true), APPEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const handleStar = () => {
    setStarState("starred");
    window.open(REPO_URL, "_blank", "noopener,noreferrer");
    setVisible(false);
  };

  const handleSnooze = () => {
    setStarState("snoozed", SNOOZE_DAYS * 24 * 60 * 60 * 1000);
    setVisible(false);
  };

  const handleDismiss = () => {
    setStarState("dismissed");
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-24 right-6 z-50 w-80 rounded-lg border border-amber-500/30 bg-card/95 p-4 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="dialog"
      aria-label="Star Vynl on GitHub"
    >
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
          <Star className="h-4.5 w-4.5 fill-amber-400 text-amber-400" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium leading-tight">Enjoying Vynl?</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Please give us a star on GitHub. It takes a second and it really helps the project.
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleStar}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-amber-400"
        >
          <Github className="h-3.5 w-3.5" />
          Star on GitHub
        </button>
        <button
          onClick={handleSnooze}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Later
        </button>
      </div>
    </div>
  );
}
