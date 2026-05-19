import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { beetsaiActions, beetsaiReview } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { applyModify, applyWrite, applyRemove } from "@/lib/beets-doctor/apply";
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

  // If the item was queued in plan mode, accept = "I would accept this if
  // it were real" — just resolve the row without running any beet command.
  // Useful for testing the review workflow on a Mac where beet isn't
  // installed (or against a shared library DB you don't want to write to).
  const context = row.context ? JSON.parse(row.context) : {};
  if (context.planMode === true) {
    db.update(beetsaiReview)
      .set({ status: "accepted", resolvedAt: new Date().toISOString() })
      .where(eq(beetsaiReview.id, id))
      .run();
    return NextResponse.json({
      accepted: true,
      planMode: true,
      appliedCount: 0,
      failedCount: 0,
      note: "Plan-mode item — marked accepted without running beet.",
    });
  }

  const applyResults: Array<{
    success: boolean;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    error?: string;
    args: string[];
    targetAlbum: string;
  }> = [];

  if (row.issueType === "compilation" || row.issueType === "wrong-genre") {
    const result = await applyModify(args, row.albumName);
    applyResults.push({ ...result, args, targetAlbum: row.albumName });
  } else if (row.issueType === "junk") {
    // First arg of proposedArgs tells us whether to remove or modify
    const result =
      args[0] === "remove"
        ? await applyRemove(args)
        : await applyModify(args, row.albumName);
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

  // STRICT-ACCEPT INVARIANT: a review row only flips to "accepted" if
  // every apply succeeded AND the apply actually had an effect (exit
  // code 0 AND either we have a meaningful before/after snapshot OR
  // we ran a remove command, where after will be empty by design).
  // Previously, a beet command that ran cleanly but matched zero items
  // returned success: true → status: "accepted" → audit lied. The
  // before/after check below catches the phantom-success case.
  const meaningfulApplies = applyResults.filter((r) => {
    if (!r.success) return false;
    if (r.args[0] === "remove") return true; // removes have no after-snapshot
    // For modify: require at least an after-snapshot key count > 0,
    // OR detectable change between before and after.
    const after = r.after as Record<string, unknown> | undefined;
    return after && Object.keys(after).length > 0;
  });
  const phantomSuccesses = applyResults.length - failures.length - meaningfulApplies.length;
  const allReallyApplied =
    failures.length === 0 && phantomSuccesses === 0 && applyResults.length > 0;

  db.update(beetsaiReview)
    .set({
      status: allReallyApplied ? "accepted" : "pending",
      resolvedAt: allReallyApplied ? new Date().toISOString() : null,
    })
    .where(eq(beetsaiReview.id, id))
    .run();

  // Richer payload so the future ApplyOutputBlock UI can show stdout +
  // before/after diff inline. Today's UI ignores the extra fields.
  return NextResponse.json({
    accepted: allReallyApplied,
    appliedCount: meaningfulApplies.length,
    failedCount: failures.length,
    phantomCount: phantomSuccesses,
    failures: failures.map((f) => f.error),
    results: applyResults.map((r) => ({
      targetAlbum: r.targetAlbum,
      args: r.args,
      success: r.success,
      stdout: (r as unknown as { stdout?: string }).stdout,
      stderr: (r as unknown as { stderr?: string }).stderr,
      exitCode: (r as unknown as { exitCode?: number | null }).exitCode,
      before: r.before,
      after: r.after,
      vynlRowsUpdated: (r as unknown as { vynlRowsUpdated?: number | null }).vynlRowsUpdated,
      error: r.error,
    })),
  });
}
