import { db } from "./db";
import { lidarrConfig } from "./db/schema";
import { eq, sql } from "drizzle-orm";

export interface LidarrTestResult {
  ok: boolean;
  version?: string;
  artistCount?: number;
  rootFolder?: { path: string; freeSpace: number; totalSpace: number };
  qualityProfiles?: Array<{ id: number; name: string }>;
  metadataProfiles?: Array<{ id: number; name: string }>;
  error?: string;
}

// ── Config helpers ──────────────────────────────────────────────────

export async function getLidarrConfig() {
  const rows = db.select().from(lidarrConfig).limit(1).all();
  return rows[0] ?? null;
}

export async function saveLidarrConfig(
  url: string,
  apiKey: string,
  extras?: {
    rootFolderPath?: string;
    qualityProfileId?: number;
    metadataProfileId?: number;
    lastTestedAt?: string;
    lastTestResult?: string;
  }
) {
  const existing = await getLidarrConfig();
  const now = new Date().toISOString();

  if (existing) {
    db.update(lidarrConfig)
      .set({
        url: url.replace(/\/+$/, ""),
        apiKey,
        rootFolderPath: extras?.rootFolderPath ?? existing.rootFolderPath,
        qualityProfileId: extras?.qualityProfileId ?? existing.qualityProfileId,
        metadataProfileId: extras?.metadataProfileId ?? existing.metadataProfileId,
        lastTestedAt: extras?.lastTestedAt ?? existing.lastTestedAt,
        lastTestResult: extras?.lastTestResult ?? existing.lastTestResult,
        updatedAt: now,
      })
      .where(eq(lidarrConfig.id, existing.id))
      .run();
  } else {
    db.insert(lidarrConfig)
      .values({
        url: url.replace(/\/+$/, ""),
        apiKey,
        rootFolderPath: extras?.rootFolderPath ?? null,
        qualityProfileId: extras?.qualityProfileId ?? null,
        metadataProfileId: extras?.metadataProfileId ?? null,
        lastTestedAt: extras?.lastTestedAt ?? null,
        lastTestResult: extras?.lastTestResult ?? null,
      })
      .run();
  }
}

// ── Artist search / add ─────────────────────────────────────────────

export interface LidarrArtistLookup {
  foreignArtistId: string;
  artistName: string;
  overview?: string;
  images?: Array<{ url: string; coverType: string }>;
}

export async function searchArtist(
  url: string,
  apiKey: string,
  term: string
): Promise<LidarrArtistLookup[]> {
  return lidarrFetch(url, apiKey, `/api/v1/artist/lookup?term=${encodeURIComponent(term)}`);
}

export async function getExistingArtists(
  url: string,
  apiKey: string
): Promise<Map<string, number>> {
  const artists: Array<{ id: number; foreignArtistId: string }> =
    await lidarrFetch(url, apiKey, "/api/v1/artist");
  const map = new Map<string, number>();
  for (const a of artists) {
    map.set(a.foreignArtistId, a.id);
  }
  return map;
}

export interface AddArtistOpts {
  foreignArtistId: string;
  artistName: string;
  rootFolderPath: string;
  qualityProfileId: number;
  metadataProfileId: number;
  monitored?: boolean;
  searchForMissingAlbums?: boolean;
}

export async function addArtist(
  url: string,
  apiKey: string,
  opts: AddArtistOpts
): Promise<{ id: number; artistName: string }> {
  const endpoint = `${url.replace(/\/+$/, "")}/api/v1/artist`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      foreignArtistId: opts.foreignArtistId,
      artistName: opts.artistName,
      rootFolderPath: opts.rootFolderPath,
      qualityProfileId: opts.qualityProfileId,
      metadataProfileId: opts.metadataProfileId,
      monitored: opts.monitored ?? true,
      monitorNewItems: "all",
      addOptions: {
        monitor: "all",
        searchForMissingAlbums: opts.searchForMissingAlbums ?? true,
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

// ── Connection test ─────────────────────────────────────────────────

async function lidarrFetch(baseUrl: string, apiKey: string, path: string) {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function testLidarrConnection(
  url: string,
  apiKey: string
): Promise<LidarrTestResult> {
  try {
    // 1. System status — confirms connectivity + gets version
    const status = await lidarrFetch(url, apiKey, "/api/v1/system/status");

    // 2-5. Parallel requests for remaining data
    const [rootFolders, artists, qualityProfiles, metadataProfiles] =
      await Promise.all([
        lidarrFetch(url, apiKey, "/api/v1/rootfolder").catch(() => []),
        lidarrFetch(url, apiKey, "/api/v1/artist").catch(() => []),
        lidarrFetch(url, apiKey, "/api/v1/qualityprofile").catch(() => []),
        lidarrFetch(url, apiKey, "/api/v1/metadataprofile").catch(() => []),
      ]);

    const rf = Array.isArray(rootFolders) && rootFolders[0]
      ? {
          path: rootFolders[0].path as string,
          freeSpace: rootFolders[0].freeSpace as number,
          totalSpace: rootFolders[0].totalSpace as number,
        }
      : undefined;

    return {
      ok: true,
      version: `${status.version}${status.isDocker ? " (Docker)" : ""}`,
      artistCount: Array.isArray(artists) ? artists.length : 0,
      rootFolder: rf,
      qualityProfiles: Array.isArray(qualityProfiles)
        ? qualityProfiles.map((p: { id: number; name: string }) => ({
            id: p.id,
            name: p.name,
          }))
        : [],
      metadataProfiles: Array.isArray(metadataProfiles)
        ? metadataProfiles.map((p: { id: number; name: string }) => ({
            id: p.id,
            name: p.name,
          }))
        : [],
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    const isTimeout =
      message.includes("abort") || message.includes("timeout");
    return {
      ok: false,
      error: isTimeout
        ? `Connection timed out — is Lidarr running at ${url}?`
        : `Connection failed: ${message}`,
    };
  }
}
