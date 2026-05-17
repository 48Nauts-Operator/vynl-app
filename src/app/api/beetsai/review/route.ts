import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { beetsaiReview } from "@/lib/db/schema";
import { desc, eq, and } from "drizzle-orm";

// GET /api/beetsai/review?status=pending&scanId=…
//   Returns review-queue rows for the BeetsAI Doctor UI.
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") || "pending";
  const scanId = request.nextUrl.searchParams.get("scanId");

  const conds = [eq(beetsaiReview.status, status)];
  if (scanId) conds.push(eq(beetsaiReview.scanId, scanId));

  const rows = db
    .select()
    .from(beetsaiReview)
    .where(and(...conds))
    .orderBy(desc(beetsaiReview.createdAt))
    .limit(500)
    .all();

  // Parse JSON-string columns for the client.
  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      context: r.context ? JSON.parse(r.context) : null,
      proposedArgs: r.proposedArgs ? JSON.parse(r.proposedArgs) : null,
    })),
  });
}
