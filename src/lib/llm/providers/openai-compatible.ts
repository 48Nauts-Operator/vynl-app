// One adapter that talks to any OpenAI-compatible chat-completions
// endpoint. Covers OpenRouter, Ollama (>=0.1.30, `/v1/chat/completions`),
// and LM Studio's local server. All three speak the same JSON schema.

import type { LLMGenerateOptions, LLMSettingsResolved } from "..";

interface ChatCompletionResponse {
  choices: { message: { role: string; content: string } }[];
}

export async function callOpenAICompatible(
  settings: LLMSettingsResolved,
  opts: LLMGenerateOptions
): Promise<string> {
  if (!settings.endpoint) {
    throw new Error(
      `No endpoint configured for ${settings.provider}. Set it in Settings → LLM Provider.`
    );
  }

  // Normalise — strip any trailing slash and ensure /chat/completions is appended.
  const base = settings.endpoint.replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions")
    ? base
    : `${base}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const body: Record<string, unknown> = {
    model: settings.model,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: opts.maxTokens ?? settings.maxTokens,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.jsonMode) {
    // response_format is finicky across providers: OpenRouter accepts
    // {type: "json_object"}, LM Studio only accepts "text" or "json_schema",
    // older Ollama ignores it. Rather than per-provider gymnastics we rely
    // on the prompt's "Return ONLY JSON" instructions, which all modern
    // models honour. If we ever need hard enforcement, switch to
    // json_schema with an explicit Zod-generated schema per call site.
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${settings.provider} HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content ?? "";
  return content.trim();
}
