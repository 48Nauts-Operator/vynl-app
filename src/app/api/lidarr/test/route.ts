import { NextResponse } from "next/server";
import {
  getLidarrConfig,
  saveLidarrConfig,
  testLidarrConnection,
} from "@/lib/lidarr";

export async function POST(req: Request) {
  let url: string | undefined;
  let apiKey: string | undefined;

  try {
    const body = await req.json();
    url = body.url;
    apiKey = body.apiKey;
  } catch {
    // Empty body — fall back to saved config
  }

  // Fall back to saved config if not provided
  if (!url || !apiKey) {
    const saved = await getLidarrConfig();
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: "No Lidarr config saved. Provide url and apiKey." },
        { status: 400 }
      );
    }
    url = url || saved.url;
    apiKey = apiKey || saved.apiKey;
  }

  const result = await testLidarrConnection(url, apiKey);

  // On success, auto-save discovered config back to DB
  if (result.ok) {
    const firstQuality = result.qualityProfiles?.[0];
    const firstMetadata = result.metadataProfiles?.[0];

    await saveLidarrConfig(url, apiKey, {
      rootFolderPath: result.rootFolder?.path,
      qualityProfileId: firstQuality?.id,
      metadataProfileId: firstMetadata?.id,
      lastTestedAt: new Date().toISOString(),
      lastTestResult: "ok",
    });
  }

  return NextResponse.json(result);
}
