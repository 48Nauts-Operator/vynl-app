/**
 * POST /api/firestorage/[id]/purge
 * Permanently destroy a FireStorage entry. Requires 2FA verification
 * (TODO when 2FA module lands — for now requires the special header
 * `x-firestorage-purge-confirm: I-UNDERSTAND-THIS-IS-PERMANENT`).
 *
 * Per RULE #1 — see project memory [[no-destruction-without-failsafes]].
 */
import { NextRequest, NextResponse } from "next/server";
import { deleteService } from "@/lib/delete-service";

const PURGE_CONFIRM_HEADER = "x-firestorage-purge-confirm";
const PURGE_CONFIRM_VALUE = "I-UNDERSTAND-THIS-IS-PERMANENT";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Pre-2FA gate: explicit confirmation header. Once 2FA ships this
  // becomes a TOTP code check instead.
  const confirm = request.headers.get(PURGE_CONFIRM_HEADER);
  if (confirm !== PURGE_CONFIRM_VALUE) {
    return NextResponse.json(
      {
        error: "purge confirmation required",
        message: `Send header ${PURGE_CONFIRM_HEADER}: ${PURGE_CONFIRM_VALUE} to confirm. This is permanent and cannot be undone.`,
      },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const entryId = parseInt(id, 10);
  if (!Number.isFinite(entryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    deleteService.purge(entryId, "ui");
    return NextResponse.json({ purged: true });
  } catch (err) {
    return NextResponse.json(
      { error: "purge failed", details: String(err) },
      { status: 500 }
    );
  }
}
