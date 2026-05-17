// Anthropic Messages API adapter. Uses the official @anthropic-ai/sdk so we
// get the right schema, retries, and error types.

import Anthropic from "@anthropic-ai/sdk";
import type { LLMGenerateOptions, LLMSettingsResolved } from "..";

export async function callAnthropic(
  settings: LLMSettingsResolved,
  opts: LLMGenerateOptions
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error(
      "Anthropic API key is not configured. Set it in Settings → LLM Provider."
    );
  }
  const client = new Anthropic({ apiKey: settings.apiKey });

  // Anthropic puts system messages in a top-level `system` field, not in the
  // messages array — split them out.
  const systemMessages = opts.messages.filter((m) => m.role === "system");
  const turns = opts.messages.filter((m) => m.role !== "system");

  const response = await client.messages.create({
    model: settings.model,
    max_tokens: opts.maxTokens ?? settings.maxTokens,
    temperature: opts.temperature,
    system: systemMessages.map((m) => m.content).join("\n\n") || undefined,
    messages: turns.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  // Anthropic returns content as an array of blocks; concatenate any text ones.
  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}
