import { NextResponse } from "next/server";
import { getLidarrConfig } from "@/lib/lidarr";

/**
 * GET /api/lidarr/diagnostic
 *
 * Aggregates the four Lidarr surfaces the user always needs to see when
 * debugging "nothing happens after I clicked Push":
 *
 *   - /api/v1/health            → big yellow/red banners (no indexer, no
 *                                  download client, disk full, etc.)
 *   - /api/v1/indexer           → which search backends are wired up
 *                                  and whether RSS / automatic search is on
 *   - /api/v1/downloadclient    → where Lidarr would send a grabbed release
 *   - /api/v1/rootfolder        → writable, has space?
 *   - /api/v1/wanted/missing    → how many monitored albums are stuck
 *   - /api/v1/system/status     → version, branch, uptime, OS info
 *
 * Surfaces the result in one JSON blob the wishlist page can render
 * underneath the Push button so the user doesn't have to leave Vynl to
 * see what Lidarr's state is.
 */

interface LidarrHealthItem {
  source: string;
  type: string;
  message: string;
  wikiUrl?: string;
}

interface LidarrIndexer {
  id: number;
  name: string;
  enable: boolean;
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  protocol: string;
}

interface LidarrDownloadClient {
  id: number;
  name: string;
  enable: boolean;
  protocol: string;
}

interface LidarrRootFolder {
  id: number;
  path: string;
  accessible: boolean;
  freeSpace: number;
  totalSpace?: number;
}

async function getJson<T>(url: string, key: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": key },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const cfg = await getLidarrConfig();
  if (!cfg || !cfg.url || !cfg.apiKey) {
    return NextResponse.json(
      { configured: false, error: "Lidarr not configured in Settings" },
      { status: 200 }
    );
  }

  const base = cfg.url.replace(/\/$/, "");
  const key = cfg.apiKey;

  // Fire all probes in parallel. Capture each one's success/failure so
  // a single API hang doesn't blank the whole diagnostic.
  const probe = async <T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
    try {
      const data = await getJson<T>(`${base}${path}`, key);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const [statusR, healthR, indexersR, clientsR, rootsR, missingR] = await Promise.all([
    probe<{ version: string; branch: string; runtimeVersion: string; startTime: string }>("/api/v1/system/status"),
    probe<LidarrHealthItem[]>("/api/v1/health"),
    probe<LidarrIndexer[]>("/api/v1/indexer"),
    probe<LidarrDownloadClient[]>("/api/v1/downloadclient"),
    probe<LidarrRootFolder[]>("/api/v1/rootfolder"),
    probe<{ totalRecords: number }>("/api/v1/wanted/missing?pageSize=1&monitored=true"),
  ]);

  // Boil down into a flat shape the UI can render directly.
  const indexers = indexersR.ok ? indexersR.data : [];
  const clients = clientsR.ok ? clientsR.data : [];
  const roots = rootsR.ok ? rootsR.data : [];
  const health = healthR.ok ? healthR.data : [];

  const enabledIndexers = indexers.filter((i) => i.enable);
  const enabledClients = clients.filter((c) => c.enable);
  const writableRoots = roots.filter((r) => r.accessible);

  // Synthesise a "ready to grab?" boolean + list of blockers — the
  // single most useful thing for the user.
  const blockers: string[] = [];
  if (enabledIndexers.length === 0) blockers.push("No enabled indexer — Lidarr can't search for releases.");
  if (enabledClients.length === 0) blockers.push("No enabled download client — Lidarr can't grab releases.");
  if (writableRoots.length === 0) blockers.push("No writable root folder — Lidarr has nowhere to put files.");
  if (healthR.ok && health.some((h) => h.type === "error")) {
    blockers.push(`Lidarr reports ${health.filter((h) => h.type === "error").length} health error(s).`);
  }

  return NextResponse.json({
    configured: true,
    url: base,
    fetchedAt: new Date().toISOString(),
    blockers,
    ready: blockers.length === 0,
    status: statusR.ok
      ? { version: statusR.data.version, branch: statusR.data.branch, runtime: statusR.data.runtimeVersion }
      : { error: statusR.error },
    health: healthR.ok
      ? health.map((h) => ({ type: h.type, source: h.source, message: h.message }))
      : { error: healthR.error },
    indexers: indexersR.ok
      ? indexers.map((i) => ({
          id: i.id,
          name: i.name,
          enable: i.enable,
          rss: i.enableRss,
          automaticSearch: i.enableAutomaticSearch,
          protocol: i.protocol,
        }))
      : { error: indexersR.error },
    downloadClients: clientsR.ok
      ? clients.map((c) => ({ id: c.id, name: c.name, enable: c.enable, protocol: c.protocol }))
      : { error: clientsR.error },
    rootFolders: rootsR.ok
      ? roots.map((r) => ({
          id: r.id,
          path: r.path,
          accessible: r.accessible,
          freeSpaceGb: Math.round(r.freeSpace / 1024 / 1024 / 1024),
        }))
      : { error: rootsR.error },
    missing: missingR.ok
      ? { total: missingR.data.totalRecords }
      : { error: missingR.error },
  });
}
