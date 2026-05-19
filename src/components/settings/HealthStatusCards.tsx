"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle, Loader2, Database, BrainCircuit, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "loading" | "ok" | "warning" | "error";

interface HealthRow {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: Status;
  message: string;
}

const statusColours: Record<Status, string> = {
  loading: "text-muted-foreground border-border",
  ok: "text-emerald-400 border-emerald-500/30",
  warning: "text-amber-300 border-amber-500/30",
  error: "text-red-300 border-red-500/40",
};

const statusBg: Record<Status, string> = {
  loading: "bg-secondary/20",
  ok: "bg-emerald-500/5",
  warning: "bg-amber-500/5",
  error: "bg-red-500/5",
};

const statusIcon: Record<Status, React.ComponentType<{ className?: string }>> = {
  loading: Loader2,
  ok: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};

/**
 * Three top-of-Settings cards showing the most load-bearing system
 * health signals at a glance: LLM connectivity, Music library / Beets
 * DB reachability, Vynl DB. Each card polls a lightweight endpoint
 * once on mount.
 *
 * The full Flight Check panel (collapsible below) still does the
 * detailed diagnostic; these cards are the "is it on fire?" view.
 */
export function HealthStatusCards() {
  const [rows, setRows] = useState<HealthRow[]>([
    { key: "llm", label: "LLM", icon: BrainCircuit, status: "loading", message: "Checking…" },
    { key: "music", label: "Music Library", icon: FolderOpen, status: "loading", message: "Checking…" },
    { key: "db", label: "Vynl DB", icon: Database, status: "loading", message: "Checking…" },
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/flight-check", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        // The flight-check endpoint returns a list of named checks. We
        // pick the three we care about for the top-line summary. If a
        // specific check is missing the card stays as a warning so we
        // don't claim everything is green.
        const checks: Array<{ name: string; ok: boolean; message?: string }> =
          data.checks || data.results || [];
        const find = (needle: string) =>
          checks.find((c) => c.name.toLowerCase().includes(needle));
        const map = (
          c: { ok: boolean; message?: string } | undefined,
          fallback: string
        ): { status: Status; message: string } =>
          !c
            ? { status: "warning", message: "Not reported" }
            : c.ok
              ? { status: "ok", message: c.message || fallback }
              : { status: "error", message: c.message || "Failed" };

        setRows([
          { key: "llm", label: "LLM", icon: BrainCircuit, ...map(find("llm"), "Reachable") },
          { key: "music", label: "Music Library", icon: FolderOpen, ...map(find("music") || find("beets"), "Mounted") },
          { key: "db", label: "Vynl DB", icon: Database, ...map(find("vynl") || find("db"), "Open") },
        ]);
      } catch (err) {
        if (cancelled) return;
        setRows((prev) =>
          prev.map((r) => ({ ...r, status: "warning" as Status, message: `Probe failed: ${String(err).slice(0, 40)}` }))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {rows.map((r) => {
        const Icon = r.icon;
        const StatusIcon = statusIcon[r.status];
        return (
          <Card
            key={r.key}
            className={cn(
              "border",
              statusColours[r.status],
              statusBg[r.status]
            )}
          >
            <CardContent className="p-3 flex items-start gap-2.5">
              <Icon className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground">{r.label}</p>
                  <StatusIcon
                    className={cn(
                      "h-3.5 w-3.5",
                      r.status === "loading" && "animate-spin"
                    )}
                  />
                </div>
                <p className="text-xs mt-0.5 truncate" title={r.message}>
                  {r.message}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
