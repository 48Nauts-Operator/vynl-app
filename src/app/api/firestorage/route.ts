/**
 * FireStorage list + summary endpoint.
 * GET /api/firestorage         → entries + summary
 *
 * The DELETE side of FireStorage (purge) lives at /api/firestorage/[id]/purge
 * and requires 2FA verification (TODO when 2FA module lands).
 */
import { NextRequest, NextResponse } from "next/server";
import { deleteService } from "@/lib/delete-service";

export async function GET(request: NextRequest) {
  const status = (request.nextUrl.searchParams.get("status") || "held") as
    | "held"
    | "restored"
    | "purged";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "200", 10);

  const entries = deleteService.list({ status, limit });
  const heldBytes = deleteService.heldBytes();

  return NextResponse.json({
    entries,
    summary: {
      heldCount: entries.filter((e) => e.status === "held").length,
      heldBytes,
    },
  });
}
