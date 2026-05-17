import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { llmSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  DEFAULT_ENDPOINTS,
  getActiveSettings,
  testConnection,
  type LLMProvider,
  type LLMSettingsResolved,
} from "@/lib/llm";

const VALID_PROVIDERS: LLMProvider[] = ["anthropic", "openrouter", "ollama", "lmstudio"];

function redact(s: LLMSettingsResolved) {
  return {
    ...s,
    apiKey: s.apiKey ? `${s.apiKey.slice(0, 8)}…` : null,
    hasApiKey: Boolean(s.apiKey),
  };
}

export async function GET() {
  const settings = getActiveSettings();
  return NextResponse.json({
    settings: redact(settings),
    defaults: DEFAULT_ENDPOINTS,
    providers: VALID_PROVIDERS,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { provider, model, endpoint, apiKey, maxTokens, test } = body;

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!model || typeof model !== "string") {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }

  // If `test: true`, evaluate the proposed settings without persisting.
  if (test) {
    const proposed: LLMSettingsResolved = {
      provider,
      model,
      endpoint: endpoint || DEFAULT_ENDPOINTS[provider as LLMProvider],
      apiKey: apiKey || (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY ?? null : null),
      maxTokens: maxTokens || 4000,
    };
    const result = await testConnection(proposed);
    return NextResponse.json(result);
  }

  // Treat empty string as "keep existing apiKey" — convenient when the UI
  // ships back the redacted form on save.
  const existing = db.select().from(llmSettings).where(eq(llmSettings.id, 1)).get();
  const finalApiKey =
    apiKey === undefined || apiKey === null || apiKey === ""
      ? existing?.apiKey ?? null
      : apiKey;

  db.insert(llmSettings)
    .values({
      id: 1,
      provider,
      model,
      endpoint: endpoint || null,
      apiKey: finalApiKey,
      maxTokens: maxTokens || 4000,
    })
    .onConflictDoUpdate({
      target: llmSettings.id,
      set: {
        provider,
        model,
        endpoint: endpoint || null,
        apiKey: finalApiKey,
        maxTokens: maxTokens || 4000,
        updatedAt: new Date().toISOString(),
      },
    })
    .run();

  return NextResponse.json({
    settings: redact(getActiveSettings()),
    saved: true,
  });
}
