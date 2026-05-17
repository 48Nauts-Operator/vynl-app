import { NextResponse } from "next/server";
import { runFlightCheck } from "@/lib/flight-check";

// GET /api/flight-check
//   Runs all environment checks and returns them as a flat array. Powers
//   the Flight Check panel in /settings. No caching — always live.
export async function GET() {
  const checks = await runFlightCheck();
  const summary = {
    ok: checks.filter((c) => c.status === "ok").length,
    warn: checks.filter((c) => c.status === "warn").length,
    error: checks.filter((c) => c.status === "error").length,
    info: checks.filter((c) => c.status === "info").length,
  };
  return NextResponse.json({ checks, summary, ranAt: new Date().toISOString() });
}
