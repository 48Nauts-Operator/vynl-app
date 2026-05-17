"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, Check, X, Loader2 } from "lucide-react";

type Provider = "anthropic" | "openrouter" | "ollama" | "lmstudio";

interface Settings {
  provider: Provider;
  model: string;
  endpoint: string | null;
  hasApiKey: boolean;
  maxTokens: number;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic (Claude)",
  openrouter: "OpenRouter",
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
};

const MODEL_HINTS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-7 · claude-opus-4-7 · claude-haiku-4-5-20251001",
  openrouter: "e.g. anthropic/claude-3.5-sonnet · meta-llama/llama-3.1-70b-instruct",
  ollama: "e.g. llama3.2 · mistral · qwen2.5",
  lmstudio: "Model identifier as shown in LM Studio's loaded-model header",
};

const NEEDS_API_KEY: Record<Provider, boolean> = {
  anthropic: true,
  openrouter: true,
  ollama: false,
  lmstudio: false,
};

export function LLMSettingsPanel() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Record<Provider, string>>({} as Record<Provider, string>);

  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [maxTokens, setMaxTokens] = useState(4000);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Available models fetched from the endpoint (for ollama/lmstudio/openrouter).
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/llm/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setDefaults(data.defaults);
        setProvider(data.settings.provider);
        setModel(data.settings.model);
        setEndpoint(data.settings.endpoint || "");
        setMaxTokens(data.settings.maxTokens);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Reset endpoint field placeholder when provider changes
  const placeholderEndpoint = defaults[provider] ?? "";
  const needsKey = NEEDS_API_KEY[provider];

  // Auto-fetch model list when provider/endpoint stabilises (debounced).
  // Anthropic skipped — no public list endpoint.
  useEffect(() => {
    if (provider === "anthropic") {
      setAvailableModels([]);
      setModelsError(null);
      return;
    }
    const target = endpoint || defaults[provider] || "";
    if (!target) return;
    const handle = setTimeout(async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const res = await fetch("/api/llm/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, endpoint: endpoint || null, apiKey: apiKey || undefined }),
        });
        const data = await res.json();
        if (data.ok) {
          setAvailableModels(data.models);
        } else {
          setAvailableModels([]);
          setModelsError(data.error || "Failed to load models");
        }
      } catch (err) {
        setAvailableModels([]);
        setModelsError(err instanceof Error ? err.message : String(err));
      } finally {
        setModelsLoading(false);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [provider, endpoint, apiKey, defaults]);

  const save = async () => {
    setSaving(true);
    setSavedAt(null);
    try {
      const res = await fetch("/api/llm/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          endpoint: endpoint || null,
          apiKey: apiKey || "",
          maxTokens,
        }),
      });
      const data = await res.json();
      if (data.saved) {
        setSettings(data.settings);
        setSavedAt(Date.now());
        setApiKey("");
      }
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/llm/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test: true,
          provider,
          model,
          endpoint: endpoint || null,
          apiKey: apiKey || undefined,
          maxTokens,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading LLM settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Brain className="h-5 w-5" />
          LLM Provider
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Used by Album analyzer, Discover samples, Artist intelligence, and DJ.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs flex items-center gap-1">
              Model
              {modelsLoading && <Loader2 className="h-3 w-3 animate-spin opacity-70" />}
            </Label>
            {provider !== "anthropic" && availableModels.length > 0 ? (
              <>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a model…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                  {availableModels.length} model{availableModels.length === 1 ? "" : "s"} loaded from endpoint
                </p>
              </>
            ) : (
              <>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={MODEL_HINTS[provider]}
                />
                <p className="text-[10px] text-muted-foreground mt-1 truncate">
                  {modelsError
                    ? `Could not list models: ${modelsError.slice(0, 80)}`
                    : MODEL_HINTS[provider]}
                </p>
              </>
            )}
          </div>
        </div>

        <div>
          <Label className="text-xs">
            Endpoint{" "}
            <span className="text-muted-foreground font-normal">
              (override — leave blank for default)
            </span>
          </Label>
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder={placeholderEndpoint}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">
              API Key{" "}
              {!needsKey && (
                <span className="text-muted-foreground font-normal">(not required for {PROVIDER_LABELS[provider]})</span>
              )}
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                settings?.hasApiKey
                  ? "•••• already set — leave blank to keep"
                  : needsKey
                    ? "Required"
                    : "Optional"
              }
            />
          </div>
          <div>
            <Label className="text-xs">Max tokens</Label>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4000)}
              min={100}
              max={32000}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={save} disabled={saving || !model}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || !model}>
            {testing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Testing…
              </>
            ) : (
              "Test connection"
            )}
          </Button>
          {testResult && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                testResult.ok ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {testResult.ok ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Connection OK
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5" />
                  {testResult.error?.slice(0, 80) || "Failed"}
                </>
              )}
            </span>
          )}
          {savedAt && (
            <span className="text-xs text-muted-foreground">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
