import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { albumRules } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export async function GET() {
  const rules = db.select().from(albumRules).all();
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  try {
    const { pattern, targetAlbum, targetAlbumArtist } = await request.json();

    if (!pattern || !targetAlbum) {
      return NextResponse.json(
        { error: "pattern and targetAlbum are required" },
        { status: 400 }
      );
    }

    // Validate regex
    try {
      new RegExp(pattern);
    } catch {
      return NextResponse.json(
        { error: "Invalid regex pattern" },
        { status: 400 }
      );
    }

    const rule = db
      .insert(albumRules)
      .values({ pattern, targetAlbum, targetAlbumArtist: targetAlbumArtist || null })
      .returning()
      .get();

    return NextResponse.json({ rule });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create rule", details: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id parameter required" }, { status: 400 });
  }

  db.delete(albumRules).where(eq(albumRules.id, Number(id))).run();
  return NextResponse.json({ deleted: true });
}
