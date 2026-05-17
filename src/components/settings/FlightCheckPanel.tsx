"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw, Loader2, Plane } from "lucide-react";

type Status = "ok" | "warn" | "error" | "info";

interface Check {
  id: string;
  category: "core" | "audio" | "ai" | "integrations" | "library";
  label: string;
  status: Status;
  message: string;
  hint?: string;
}

interface FlightResult {
  checks: Check[];
  summary: { ok: number; warn: number; error: number; info: number };
  ranAt: string;
}

const CATEGORY_LABEL: Record<Check["category"], string> = {
  core: "Core",
  audio: "Audio",
  ai: "AI / LLM",
  integrations: "Integrations",
  library: "Library",
};

const STATUS_ICON: Record<Status, React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
  info: <Info className="h-4 w-4 text-muted-foreground" />,
};

export function FlightCheckPanel() {
  const [result, setResult] = useState<FlightResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/flight-check", { cache: "no-store" });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const grouped = result?.checks.reduce(
    (acc, c) => {
      if (!acc[c.category]) acc[c.category] = [];
      acc[c.category].push(c);
      return acc;
    },
    {} as Record<Check["category"], Check[]>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plane className="h-5 w-5" />
              Flight Check
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Quick health check: configuration, dependencies, integrations.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={run} disabled={loading}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!result ? (
          <p className="text-sm text-muted-foreground">Running checks…</p>
        ) : (
          <>
            {/* Summary chips */}
            <div className="flex items-center gap-2 mb-4 text-xs">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {result.summary.ok} OK
              </span>
              {result.summary.warn > 0 && (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  {result.summary.warn} warning{result.summary.warn === 1 ? "" : "s"}
                </span>
              )}
              {result.summary.error > 0 && (
                <span className="inline-flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" />
                  {result.summary.error} error{result.summary.error === 1 ? "" : "s"}
                </span>
              )}
              {result.summary.info > 0 && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Info className="h-3 w-3" />
                  {result.summary.info} info
                </span>
              )}
              <span className="ml-auto text-muted-foreground">
                {new Date(result.ranAt).toLocaleTimeString()}
              </span>
            </div>

            {/* Grouped table */}
            {grouped &&
              (Object.keys(grouped) as Check["category"][]).map((cat) => (
                <div key={cat} className="mb-4 last:mb-0">
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    {CATEGORY_LABEL[cat]}
                  </h4>
                  <div className="border border-border rounded-md divide-y divide-border">
                    {grouped[cat].map((c) => (
                      <div key={c.id} className="px-3 py-2 text-sm">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{STATUS_ICON[c.status]}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-medium">{c.label}</span>
                              <span
                                className={`text-xs truncate ${
                                  c.status === "error"
                                    ? "text-red-500"
                                    : c.status === "warn"
                                      ? "text-amber-500"
                                      : "text-muted-foreground"
                                }`}
                                title={c.message}
                              >
                                {c.message}
                              </span>
                            </div>
                            {c.hint && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {c.hint}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
