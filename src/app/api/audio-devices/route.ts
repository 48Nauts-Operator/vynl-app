import { NextResponse } from "next/server";
import { listOutputDevices } from "@/lib/audio-devices";

export async function GET() {
  try {
    const devices = await listOutputDevices();
    return NextResponse.json({ devices });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list audio devices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
