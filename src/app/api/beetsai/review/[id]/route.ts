import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { beetsaiActions, beetsaiReview } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { applyModify, applyWrite } from "@/lib/beets-doctor/apply";
import { getActiveSettings } from "@/lib/llm";

// POST /api/beetsai/review/[id]
//   Body: { action: "accept" | "dismiss" }
//   - accept: runs the proposed beets command, writes a beetsai_actions row,
//             flips the review row to "accepted".
//   - dismiss: just flips the review row to "dismissed".
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;
  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json(
      { error: 'action must be "accept" or "dismiss"' },
      { status: 400 }
    );
  }

  const row = db.select().from(beetsaiReview).where(eq(beetsaiReview.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "review item not found" }, { status: 404 });
  }
  if (row.status !== "pending") {
    return NextResponse.json(
      { error: `already ${row.status}` },
      { status: 409 }
    );
  }

  if (action === "dismiss") {
    db.update(beetsaiReview)
      .set({ status: "dismissed", resolvedAt: new Date().toISOString() })
      .where(eq(beetsaiReview.id, id))
      .run();
    return NextResponse.json({ dismissed: true });
  }

  // accept: dispatch to apply pipeline based on issueType
  const llm = getActiveSettings();
  const args = row.proposedArgs ? (JSON.parse(row.proposedArgs) as string[]) : [];

  let applyResults: Array<{
    success: boolean;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    error?: string;
    args: string[];
    targetAlbum: string;
  }> = [];

  if (row.issueType === "compilation") {
    const result = await applyModify(args, row.albumName);
    applyResults.push({ ...result, args, targetAlbum: row.albumName });
  } else if (row.issueType === "disc-split") {
    // args here is the list of variant album names to rename to the base name
    const baseName = row.albumName;
    for (const variantName of args) {
      if (variantName === baseName) continue;
      const renameArgs = [
        "modify",
        "-y",
        `album:${variantName}`,
        `album=${baseName}`,
      ];
      const result = await applyModify(renameArgs, variantName);
      applyResults.push({ ...result, args: renameArgs, targetAlbum: variantName });
    }
    await applyWrite(`album:${baseName}`);
  } else {
    return NextResponse.json(
      { error: `unknown issueType: ${row.issueType}` },
      { status: 400 }
    );
  }

  const failures = applyResults.filter((r) => !r.success);

  // Log every individual apply attempt to beetsai_actions, success or fail.
  for (const r of applyResults) {
    db.insert(beetsaiActions)
      .values({
        issueType: row.issueType,
        albumName: r.targetAlbum,
        albumArtist: row.albumArtist,
        beetsCommand: `beet ${r.args.join(" ")}`,
        beetsArgs: JSON.stringify(r.args),
        before: JSON.stringify(r.before || {}),
        after: JSON.stringify(r.after || {}),
        source: "review-accepted",
        confidence: row.confidence,
        llmModel: row.llmModel || llm.model,
        reasoning: row.reasoning,
        status: r.success ? "applied" : "failed",
      })
      .run();
  }

  db.update(beetsaiReview)
    .set({
      status: failures.length === 0 ? "accepted" : "pending",
      resolvedAt: failures.length === 0 ? new Date().toISOString() : null,
    })
    .where(eq(beetsaiReview.id, id))
    .run();

  return NextResponse.json({
    accepted: failures.length === 0,
    appliedCount: applyResults.length - failures.length,
    failedCount: failures.length,
    failures: failures.map((f) => f.error),
  });
}
