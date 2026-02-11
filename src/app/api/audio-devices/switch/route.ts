import { NextRequest, NextResponse } from "next/server";
import { switchDevice, getCurrentDevice } from "@/lib/audio-devices";

export async function POST(req: NextRequest) {
  try {
    const { device } = await req.json();
    if (!device || typeof device !== "string") {
      return NextResponse.json({ error: "Missing device name" }, { status: 400 });
    }
    await switchDevice(device);
    const current = await getCurrentDevice();
    return NextResponse.json({ switched: true, device: current });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to switch device";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
