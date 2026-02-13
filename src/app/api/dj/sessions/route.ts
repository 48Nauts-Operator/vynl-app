// [VynlDJ] — extractable: list previous DJ sessions
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { djSessions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const sessions = db
    .select()
    .from(djSessions)
    .orderBy(desc(djSessions.createdAt))
    .limit(20)
    .all();

  return NextResponse.json({ sessions });
}
