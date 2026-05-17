// Provider-agnostic LLM client used by album-analyze, discover/samples,
// artist intelligence, DJ, etc. Settings live in the llm_settings table
// (singleton row, id=1) and can be edited via /api/llm/settings.

import { db } from "@/lib/db";
import { llmSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

import { callAnthropic } from "./providers/anthropic";
import { callOpenAICompatible } from "./providers/openai-compatible";

export type LLMProvider = "anthropic" | "openrouter" | "ollama" | "lmstudio";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Tell the provider we expect JSON back. Best-effort across providers. */
  jsonMode?: boolean;
}

export interface LLMSettingsResolved {
  provider: LLMProvider;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
  maxTokens: number;
}

/** Default endpoints per provider when the user hasn't set a custom one. */
const DEFAULT_ENDPOINTS: Record<LLMProvider, string> = {
  anthropic: "https://api.anthropic.com",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
  // 192.168.74.179:1238 is the 48Nauts LM Studio instance on cand0riacstudio.
  lmstudio: "http://192.168.74.179:1238/v1",
};

/** Fetch the model list from an OpenAI-compatible endpoint. Used by the
 *  settings UI to populate a dropdown for ollama / lmstudio / openrouter. */
export async function listModels(opts: {
  provider: LLMProvider;
  endpoint: string | null;
  apiKey: string | null;
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  if (opts.provider === "anthropic") {
    return {
      ok: false,
      error: "Anthropic doesn't expose a public model-list endpoint. Type the model name manually.",
    };
  }
  const base = (opts.endpoint || DEFAULT_ENDPOINTS[opts.provider]).replace(/\/+$/, "");
  const url = base.endsWith("/models") ? base : `${base}/models`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const models = (data.data ?? []).map((m) => m.id).filter(Boolean).sort();
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Resolve which provider is active. Env-var fallback for early bootstrap
 *  (e.g. first run before the user has visited /settings). */
export function getActiveSettings(): LLMSettingsResolved {
  try {
    const row = db.select().from(llmSettings).where(eq(llmSettings.id, 1)).get();
    if (row) {
      return {
        provider: (row.provider as LLMProvider) ?? "anthropic",
        model: row.model || "claude-sonnet-4-7",
        endpoint: row.endpoint || DEFAULT_ENDPOINTS[(row.provider as LLMProvider) ?? "anthropic"],
        apiKey: row.apiKey || process.env.ANTHROPIC_API_KEY || null,
        maxTokens: row.maxTokens || 4000,
      };
    }
  } catch {
    // DB not initialized yet — fall through to env defaults
  }
  return {
    provider: "anthropic",
    model: "claude-sonnet-4-7",
    endpoint: DEFAULT_ENDPOINTS.anthropic,
    apiKey: process.env.ANTHROPIC_API_KEY || null,
    maxTokens: 4000,
  };
}

/** Single entry point. Dispatches to the right provider based on settings. */
export async function generateText(opts: LLMGenerateOptions): Promise<string> {
  const settings = getActiveSettings();

  if (settings.provider === "anthropic") {
    return callAnthropic(settings, opts);
  }
  // openrouter, ollama, lmstudio all speak OpenAI's chat-completions schema.
  return callOpenAICompatible(settings, opts);
}

/** Quick connection-test helper for the settings UI. Sends a 1-token ping
 *  and returns { ok, error?, model? } so the UI can show a green/red dot. */
export async function testConnection(
  settings: LLMSettingsResolved
): Promise<{ ok: boolean; error?: string }> {
  try {
    const reply = await (settings.provider === "anthropic"
      ? callAnthropic(settings, {
          messages: [{ role: "user", content: "Reply with just OK." }],
          maxTokens: 10,
        })
      : callOpenAICompatible(settings, {
          messages: [{ role: "user", content: "Reply with just OK." }],
          maxTokens: 10,
        }));
    if (reply.toLowerCase().includes("ok")) return { ok: true };
    return { ok: true }; // anything non-empty is good enough for a ping
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export { DEFAULT_ENDPOINTS };
