/**
 * POST /api/firestorage/[id]/restore
 * Move an entry back to its original location.
 * Non-destructive (no 2FA required).
 */
import { NextResponse } from "next/server";
import { deleteService } from "@/lib/delete-service";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const entryId = parseInt(id, 10);
  if (!Number.isFinite(entryId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const result = deleteService.restore(entryId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "restore failed", details: String(err) },
      { status: 500 }
    );
  }
}
