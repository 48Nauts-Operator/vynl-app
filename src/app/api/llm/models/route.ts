import { NextRequest, NextResponse } from "next/server";
import { listModels, type LLMProvider } from "@/lib/llm";

// POST /api/llm/models
//   Body: { provider, endpoint?, apiKey? }
//   Fetches the available model list from the configured endpoint (works for
//   Ollama, LM Studio, OpenRouter). Anthropic returns a friendly hint to type
//   the model name manually since there's no public list endpoint.
export async function POST(request: NextRequest) {
  const { provider, endpoint, apiKey } = await request.json();
  if (!provider) {
    return NextResponse.json({ ok: false, error: "provider is required" }, { status: 400 });
  }
  const result = await listModels({
    provider: provider as LLMProvider,
    endpoint: endpoint || null,
    apiKey: apiKey || null,
  });
  return NextResponse.json(result);
}
