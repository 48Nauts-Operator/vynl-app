import { NextRequest, NextResponse } from "next/server";
import { searchCoverArt } from "@/lib/cover-art";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "query parameter required" }, { status: 400 });
  }

  try {
    const results = await searchCoverArt(query);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: "Search failed", details: String(err) },
      { status: 500 }
    );
  }
}
