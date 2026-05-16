import { NextResponse } from "next/server";
import * as sonos from "@/lib/sonos";

// GET /api/sonos/diagnostics
//   Returns the current discovery status: how speakers were found (SSDP or
//   seed IP), the device list, and any error from the last attempt.
//
// GET /api/sonos/diagnostics?refresh=1
//   Forces a fresh discovery cycle. Useful after adding a new speaker or
//   setting SONOS_SEED_IP without restarting the container.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";

  const diag = refresh ? await sonos.forceRediscover() : sonos.getDiagnostics();

  return NextResponse.json({
    discoveryMethod: diag.method,
    deviceCount: diag.deviceCount,
    devices: diag.devices,
    ssdpAttempted: diag.ssdpAttempted,
    seedIpUsed: diag.seedIpUsed ?? null,
    seedIpConfigured: Boolean(process.env.SONOS_SEED_IP),
    lastError: diag.lastError ?? null,
    lastDiscoveryAt: diag.lastDiscoveryAt ?? null,
  });
}
