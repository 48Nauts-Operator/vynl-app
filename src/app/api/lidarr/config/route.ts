import { NextResponse } from "next/server";
import { getLidarrConfig, saveLidarrConfig } from "@/lib/lidarr";

export async function GET() {
  const config = await getLidarrConfig();
  if (!config) {
    return NextResponse.json({ configured: false });
  }
  // Mask API key — show only last 4 chars
  const masked =
    config.apiKey.length > 4
      ? "●".repeat(config.apiKey.length - 4) + config.apiKey.slice(-4)
      : "●●●●";

  return NextResponse.json({
    configured: true,
    url: config.url,
    apiKey: masked,
    rootFolderPath: config.rootFolderPath,
    qualityProfileId: config.qualityProfileId,
    metadataProfileId: config.metadataProfileId,
    lastTestedAt: config.lastTestedAt,
    lastTestResult: config.lastTestResult,
  });
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { url, apiKey } = body;

  if (!url || !apiKey) {
    return NextResponse.json(
      { error: "url and apiKey are required" },
      { status: 400 }
    );
  }

  await saveLidarrConfig(url, apiKey);
  return NextResponse.json({ saved: true });
}
