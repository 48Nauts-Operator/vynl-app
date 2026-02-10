import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: importPath, autotag = true, move = true } = body;

    if (!importPath || typeof importPath !== "string") {
      return NextResponse.json(
        { error: "path is required" },
        { status: 400 }
      );
    }

    const args = ["import"];
    if (!autotag) args.push("--noautotag");
    if (move) args.push("--move");
    args.push("-q"); // quiet (non-interactive)
    args.push(importPath);

    const { stdout, stderr } = await execFileAsync("beet", args, {
      timeout: 300000, // 5 minutes
    });

    // After import, trigger a re-scan
    const scanRes = await fetch(
      `${process.env.TUNIFY_HOST || "http://localhost:3101"}/api/library/scan?adapter=beets`,
      { method: "POST" }
    );
    const scanData = await scanRes.json();

    return NextResponse.json({
      success: true,
      output: stdout,
      warnings: stderr || undefined,
      scan: scanData,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Import failed", details: String(err) },
      { status: 500 }
    );
  }
}
