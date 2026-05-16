import { NextResponse } from "next/server";
import { getAggregatedStats } from "@/lib/github-stats";

// GET /api/github-stats
//   Returns repo info, releases (with per-asset download counts), and traffic
//   (when GH_STATS_PAT is set). The response is cached for 5 minutes upstream
//   in src/lib/github-stats.ts.
export async function GET() {
  const stats = await getAggregatedStats();
  return NextResponse.json(stats);
}
