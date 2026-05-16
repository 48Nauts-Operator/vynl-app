import { NextRequest, NextResponse } from "next/server";
import * as sonos from "@/lib/sonos";

export async function POST(request: NextRequest) {
  const { action, speaker, target, coordinatorUdn } = await request.json();

  try {
    if (action === "join" && speaker && target) {
      await sonos.groupJoin(speaker, target);
    } else if (action === "party" && speaker) {
      await sonos.groupParty(speaker);
    } else if (action === "leave" && speaker) {
      await sonos.groupLeave(speaker);
    } else if (action === "dissolve" && coordinatorUdn) {
      await sonos.groupDissolve(coordinatorUdn);
    } else {
      return NextResponse.json({ error: "Invalid group action" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
