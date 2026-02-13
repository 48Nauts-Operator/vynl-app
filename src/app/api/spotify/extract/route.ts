import { NextResponse } from "next/server";
import { startExtract, getExtractStatus, cancelExtract } from "@/lib/spotify-extract";

/** POST — start a new extraction */
export async function POST() {
  try {
    const result = await startExtract();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 400 }
    );
  }
}

/** GET — poll extraction status */
export async function GET() {
  return NextResponse.json(getExtractStatus());
}

/** DELETE — cancel running extraction */
export async function DELETE() {
  cancelExtract();
  return NextResponse.json({ cancelled: true });
}
