import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

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

    // Count items before import
    const Database = (await import("better-sqlite3")).default;
    const beetsDbPath = process.env.BEETS_DB_PATH || path.join(os.homedir(), ".config", "beets", "library.db");
    const countBefore = (() => {
      try {
        const bdb = new Database(beetsDbPath);
        const row = bdb.prepare("SELECT COUNT(*) as count FROM items").get() as { count: number };
        bdb.close();
        return row.count;
      } catch { return 0; }
    })();

    // Try auto-tag first (quiet mode)
    const args = ["import", "-q"];
    if (!autotag) args.push("--noautotag");
    if (move) args.push("--move");
    args.push(importPath);

    let output = "";
    let warnings = "";
    try {
      const result = await execFileAsync("beet", args, { timeout: 300000 });
      output = result.stdout;
      warnings = result.stderr || "";
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string };
      output = e.stdout || "";
      warnings = e.stderr || "";
    }

    // Check if anything was actually imported
    const countAfter = (() => {
      try {
        const bdb = new Database(beetsDbPath);
        const row = bdb.prepare("SELECT COUNT(*) as count FROM items").get() as { count: number };
        bdb.close();
        return row.count;
      } catch { return 0; }
    })();

    // If auto-tag imported nothing, retry with --noautotag
    let retried = false;
    if (countAfter === countBefore && autotag) {
      const retryArgs = ["import", "--noautotag"];
      if (move) retryArgs.push("--move");
      retryArgs.push(importPath);

      try {
        const result = await execFileAsync("beet", retryArgs, { timeout: 300000 });
        output += "\n[Retried with existing tags]\n" + result.stdout;
        warnings += result.stderr || "";
        retried = true;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string };
        output += "\n[Retry failed]\n" + (e.stdout || "");
        warnings += e.stderr || "";
      }
    }

    // After import, trigger a re-scan
    const baseUrl = process.env.VYNL_HOST || "http://localhost:3101";
    const scanRes = await fetch(
      `${baseUrl}/api/library/scan?adapter=beets`,
      { method: "POST" }
    );
    const scanData = await scanRes.json();

    // Auto-fetch album art for newly imported tracks
    let artResult = null;
    try {
      const artRes = await fetch(`${baseUrl}/api/library/housekeeping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch-artwork" }),
      });
      artResult = await artRes.json();

      // Rescan covers to extract any newly fetched embedded art
      await fetch(`${baseUrl}/api/library/housekeeping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan-covers" }),
      });
    } catch {
      // Art fetch is best-effort, don't fail the import
    }

    return NextResponse.json({
      success: true,
      output,
      warnings: warnings || undefined,
      retried,
      scan: scanData,
      artwork: artResult,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Import failed", details: String(err) },
      { status: 500 }
    );
  }
}
