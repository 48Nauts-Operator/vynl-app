// BeetsAI Doctor — knowledge feedback loop.
//
// As the user accepts / dismisses Doctor's suggestions, those decisions
// become training context for future scans. Each LLM call receives a few
// recent decisions of the same issue type so the model can calibrate to
// the user's specific preferences (e.g. "this library considers
// X-style albums NOT compilations" or "always merges disc-splits").
//
// We deliberately keep this lightweight — no fine-tuning, no embeddings,
// just a curated few-shot prefix in the prompt. Cheap, transparent,
// works with every provider.

import { db } from "@/lib/db";
import { beetsaiActions, beetsaiReview } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

export interface DecisionExample {
  album: string;
  decided: "applied" | "dismissed";
  reason: string;
  confidence: number | null;
}

/**
 * Pull the most recent N decisions for a given issue type. Combines
 * applied actions (auto + review-accepted) and dismissed review items
 * so the LLM sees both "yes" and "no" examples.
 */
export function getRecentDecisions(
  issueType: string,
  limit = 6
): DecisionExample[] {
  // Recent applied — strong signal the user (implicitly or explicitly)
  // agreed with the LLM's call.
  const applied = db
    .select()
    .from(beetsaiActions)
    .where(
      and(eq(beetsaiActions.issueType, issueType), eq(beetsaiActions.status, "applied"))
    )
    .orderBy(desc(beetsaiActions.appliedAt))
    .limit(limit)
    .all();

  // Recent dismissed — explicit "no, the LLM was wrong" signal.
  const dismissed = db
    .select()
    .from(beetsaiReview)
    .where(
      and(eq(beetsaiReview.issueType, issueType), eq(beetsaiReview.status, "dismissed"))
    )
    .orderBy(desc(beetsaiReview.resolvedAt))
    .limit(limit)
    .all();

  const examples: DecisionExample[] = [
    ...applied.map((a) => ({
      album: a.albumName,
      decided: "applied" as const,
      reason: a.reasoning || "(no reason)",
      confidence: a.confidence,
    })),
    ...dismissed.map((d) => ({
      album: d.albumName,
      decided: "dismissed" as const,
      reason: d.reasoning || "(no reason)",
      confidence: d.confidence,
    })),
  ];

  // Interleave roughly applied/dismissed so the LLM sees both signals
  // even when one class dominates. Then cap to `limit`.
  examples.sort((a, b) => (a.decided === b.decided ? 0 : a.decided === "applied" ? -1 : 1));
  return examples.slice(0, limit);
}

/** Render decisions as a prompt prefix the LLM can use as few-shot guidance. */
export function renderDecisionContext(examples: DecisionExample[]): string {
  if (examples.length === 0) return "";
  const lines = examples.map(
    (e) =>
      `- "${e.album}" → ${e.decided === "applied" ? "FIXED" : "LEFT ALONE"} (conf ${(e.confidence ?? 0).toFixed(2)}): ${e.reason}`
  );
  return `Past decisions on this user's library (for calibration — judge similarly when patterns match):
${lines.join("\n")}

`;
}
