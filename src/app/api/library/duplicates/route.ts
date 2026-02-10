import { NextRequest, NextResponse } from "next/server";
import { findDuplicates, removeDuplicates } from "@/lib/duplicates";

export async function GET() {
  try {
    const analysis = findDuplicates();
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("Duplicate analysis error:", err);
    return NextResponse.json(
      { error: "Failed to analyze duplicates", details: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const dryRun = request.nextUrl.searchParams.get("dryRun") !== "false";
    const result = removeDuplicates(dryRun);
    return NextResponse.json({ dryRun, ...result });
  } catch (err) {
    console.error("Duplicate removal error:", err);
    return NextResponse.json(
      { error: "Failed to remove duplicates", details: String(err) },
      { status: 500 }
    );
  }
}
