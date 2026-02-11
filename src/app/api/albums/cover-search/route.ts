import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ error: "query parameter required" }, { status: 400 });
  }

  try {
    const url = `https://itunes.apple.com/search?${new URLSearchParams({
      term: query,
      entity: "album",
      limit: "8",
    })}`;

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "iTunes search failed" }, { status: 502 });
    }

    const data = await res.json();
    const results = (data.results || []).map((r: any) => ({
      name: r.collectionName,
      artist: r.artistName,
      artworkUrl: r.artworkUrl100?.replace("100x100", "600x600") || r.artworkUrl100,
      artworkUrlSmall: r.artworkUrl100,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: "Search failed", details: String(err) }, { status: 500 });
  }
}
