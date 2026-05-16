// In-process Sonos integration. Replaces the previous CLI shell-out.
// Auto-discovers speakers on the LAN via SSDP. Falls back to a single seed
// IP (SONOS_SEED_IP) when multicast discovery returns nothing — useful in
// container/VLAN setups where SSDP packets don't traverse.

import { SonosManager } from "@svrooij/sonos";
import MetadataHelper from "@svrooij/sonos/lib/helpers/metadata-helper";
import type SonosDevice from "@svrooij/sonos/lib/sonos-device";
import type { Track } from "@svrooij/sonos/lib/models";

export { searchSpotify } from "./spotify";

export interface SonosSpeaker {
  name: string;
  ip: string;
  udn?: string;
  /** UUID of this speaker's playback-group coordinator. Equals `udn` for the
   *  coordinator itself; differs for grouped members. Two speakers with the
   *  same `coordinatorUdn` are playing together. */
  coordinatorUdn?: string;
  /** Convenience: name of the group coordinator (handy for the UI). */
  coordinatorName?: string;
  /** Sonos's own zone-group name (e.g. "Office + 1"). */
  groupName?: string;
}

interface SonosStatus {
  speaker: string;
  state: string;
  title?: string;
  artist?: string;
  album?: string;
  position?: string;
  duration?: string;
  volume?: number;
}

export type DiscoveryMethod = "ssdp" | "seed" | "none";

export interface DiscoveryDiagnostics {
  method: DiscoveryMethod;
  deviceCount: number;
  ssdpAttempted: boolean;
  seedIpUsed?: string;
  lastError?: string;
  lastDiscoveryAt?: number;
}

const DISCOVERY_TTL_MS = 60_000;
const SSDP_TIMEOUT_SEC = 10;

let manager: SonosManager | null = null;
let lastDiscoveryAt = 0;
let inflight: Promise<void> | null = null;
let diagnostics: DiscoveryDiagnostics = {
  method: "none",
  deviceCount: 0,
  ssdpAttempted: false,
};

async function ensureManager(force = false): Promise<SonosManager | null> {
  const fresh = manager && Date.now() - lastDiscoveryAt < DISCOVERY_TTL_MS;
  if (manager && fresh && !force) return manager;

  if (inflight) {
    await inflight;
    return manager;
  }

  inflight = (async () => {
    const next = new SonosManager();
    const seedIp = process.env.SONOS_SEED_IP?.trim();
    const diag: DiscoveryDiagnostics = {
      method: "none",
      deviceCount: 0,
      ssdpAttempted: false,
    };

    try {
      diag.ssdpAttempted = true;
      const ok = await next.InitializeWithDiscovery(SSDP_TIMEOUT_SEC);
      if (ok && next.Devices.length > 0) {
        diag.method = "ssdp";
        diag.deviceCount = next.Devices.length;
      } else if (seedIp) {
        const seedOk = await next.InitializeFromDevice(seedIp);
        if (seedOk && next.Devices.length > 0) {
          diag.method = "seed";
          diag.seedIpUsed = seedIp;
          diag.deviceCount = next.Devices.length;
        }
      }
    } catch (err) {
      diag.lastError = err instanceof Error ? err.message : String(err);
      // SSDP threw — try seed IP if available.
      if (seedIp && next.Devices.length === 0) {
        try {
          const seedOk = await next.InitializeFromDevice(seedIp);
          if (seedOk && next.Devices.length > 0) {
            diag.method = "seed";
            diag.seedIpUsed = seedIp;
            diag.deviceCount = next.Devices.length;
            diag.lastError = undefined;
          }
        } catch (seedErr) {
          diag.lastError = seedErr instanceof Error ? seedErr.message : String(seedErr);
        }
      }
    }

    // Tear down old manager subscriptions before swapping.
    if (manager) {
      try { manager.CancelSubscription(); } catch { /* ignore */ }
    }

    manager = next;
    lastDiscoveryAt = Date.now();
    diag.lastDiscoveryAt = lastDiscoveryAt;
    diagnostics = diag;
  })();

  try {
    await inflight;
  } finally {
    inflight = null;
  }

  return manager;
}

function findDevice(name?: string): SonosDevice | null {
  if (!manager || manager.Devices.length === 0) return null;
  if (!name) return manager.Devices[0];
  return (
    manager.Devices.find((d) => d.Name === name) ??
    manager.Devices.find((d) => d.Name.toLowerCase() === name.toLowerCase()) ??
    null
  );
}

async function getDeviceByName(name?: string): Promise<SonosDevice> {
  await ensureManager();
  const device = findDevice(name);
  if (!device) {
    // One retry with forced re-discovery — speaker may have been added since last cache.
    await ensureManager(true);
    const retry = findDevice(name);
    if (!retry) throw new Error(`Sonos speaker not found: ${name ?? "(any)"}`);
    return retry;
  }
  return device;
}

function parseTrackMetadata(
  meta: Track | string | undefined,
  host: string
): { title?: string; artist?: string; album?: string } {
  if (!meta) return {};
  // Streaming sources sometimes return the raw DIDL XML string instead of a
  // parsed Track. Run it through the lib's parser to recover the fields.
  const track: Track | undefined =
    typeof meta === "string" ? MetadataHelper.ParseDIDLTrack(meta, host) : meta;
  if (!track) return {};
  return { title: track.Title, artist: track.Artist, album: track.Album };
}

// ── Public API (stable surface — preserves CLI-era signatures) ──────

export async function discover(): Promise<SonosSpeaker[]> {
  const mgr = await ensureManager();
  if (!mgr) return [];

  // Bonded zones (stereo pairs, home-theater surround) show up as multiple
  // physical SonosDevices that share a Name and a coordinator. Only the
  // coordinator accepts meaningful commands; satellites just play their
  // assigned channel. Dedupe by name, preferring the coordinator so the
  // UI shows one entry per addressable room.
  const byName = new Map<string, SonosDevice>();
  for (const d of mgr.Devices) {
    const isCoordinator = d.Coordinator?.Uuid === d.Uuid;
    const existing = byName.get(d.Name);
    if (!existing) {
      byName.set(d.Name, d);
      continue;
    }
    const existingIsCoordinator = existing.Coordinator?.Uuid === existing.Uuid;
    if (isCoordinator && !existingIsCoordinator) {
      byName.set(d.Name, d);
    }
  }

  return Array.from(byName.values()).map((d) => ({
    name: d.Name,
    ip: d.Host,
    udn: d.Uuid,
    coordinatorUdn: d.Coordinator?.Uuid,
    coordinatorName: d.Coordinator?.Name,
    groupName: d.GroupName,
  }));
}

export async function status(speaker?: string): Promise<SonosStatus | null> {
  try {
    const device = await getDeviceByName(speaker);
    // In a Sonos zone group, only the coordinator holds the real transport
    // state and track metadata; members just slave to its URI. Read playback
    // info from the coordinator but keep the queried speaker's own volume
    // (each speaker's volume is independent even within a group).
    const coordinator = device.Coordinator ?? device;

    const [transport, position, volume] = await Promise.all([
      coordinator.AVTransportService.GetTransportInfo(),
      coordinator.AVTransportService.GetPositionInfo(),
      device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: "Master" }),
    ]);

    let trackMeta = parseTrackMetadata(position.TrackMetaData, coordinator.Host);
    // Streaming radio sources commonly return empty TrackMetaData; the
    // station name/artist live on the enqueued URI metadata instead.
    if (!trackMeta.title && !trackMeta.artist) {
      try {
        const media = await coordinator.AVTransportService.GetMediaInfo();
        const mediaMeta = parseTrackMetadata(media.CurrentURIMetaData, coordinator.Host);
        if (mediaMeta.title || mediaMeta.artist) trackMeta = mediaMeta;
      } catch {
        // ignore
      }
    }

    return {
      speaker: device.Name,
      state: transport.CurrentTransportState || "unknown",
      title: trackMeta.title,
      artist: trackMeta.artist,
      album: trackMeta.album,
      position: position.RelTime,
      duration: position.TrackDuration,
      volume: volume.CurrentVolume,
    };
  } catch {
    return null;
  }
}

export async function playUri(
  speaker: string,
  uri: string,
  isRadio = false
): Promise<void> {
  const device = await getDeviceByName(speaker);
  // The CLI's --radio flag wrapped bare http(s) streams in Sonos's mp3radio scheme.
  // Sonos URIs (x-rincon-mp3radio:, x-sonosapi-stream:, etc.) are already handled.
  let finalUri = uri;
  if (isRadio && /^https?:\/\//i.test(uri)) {
    finalUri = `x-rincon-mp3radio://${uri.replace(/^https?:\/\//i, "")}`;
  }
  await device.SetAVTransportURI(finalUri);
  await device.Play();
}

export async function openSpotify(
  speaker: string,
  spotifyUri: string
): Promise<void> {
  const device = await getDeviceByName(speaker);
  // Spotify URIs (spotify:track:..., spotify:album:..., spotify:playlist:...)
  // become Sonos URIs once URL-encoded. SetAVTransportURI handles the metadata
  // lookup via the linked Spotify account on the household.
  const sonosUri = spotifyUri.startsWith("x-")
    ? spotifyUri
    : `x-sonos-spotify:${encodeURIComponent(spotifyUri)}?sid=9&flags=8224&sn=1`;
  await device.SetAVTransportURI(sonosUri);
  await device.Play();
}

export async function play(speaker: string): Promise<void> {
  try {
    const device = await getDeviceByName(speaker);
    await device.Play();
  } catch (err) {
    // UPnP 701 = transition not available (speaker still loading); safe to ignore.
    if (String(err).includes("701")) return;
    throw err;
  }
}

export async function pause(speaker: string): Promise<void> {
  try {
    const device = await getDeviceByName(speaker);
    await device.Pause();
  } catch (err) {
    if (String(err).includes("701")) return;
    throw err;
  }
}

export async function next(speaker: string): Promise<void> {
  const device = await getDeviceByName(speaker);
  await device.Next();
}

export async function prev(speaker: string): Promise<void> {
  const device = await getDeviceByName(speaker);
  await device.Previous();
}

export async function setVolume(speaker: string, volume: number): Promise<void> {
  const device = await getDeviceByName(speaker);
  const clamped = Math.max(0, Math.min(100, Math.round(volume)));
  await device.SetVolume(clamped);
}

export async function getVolume(speaker: string): Promise<number> {
  const device = await getDeviceByName(speaker);
  const res = await device.RenderingControlService.GetVolume({
    InstanceID: 0,
    Channel: "Master",
  });
  return res.CurrentVolume;
}

export async function groupJoin(speaker: string, target: string): Promise<void> {
  const device = await getDeviceByName(speaker);
  await device.JoinGroup(target);
}

export async function groupParty(speaker: string): Promise<void> {
  await ensureManager();
  const coordinator = await getDeviceByName(speaker);
  if (!manager) return;
  const others = manager.Devices.filter((d) => d.Uuid !== coordinator.Uuid);
  await Promise.all(others.map((d) => d.JoinGroup(coordinator.Name).catch(() => undefined)));
}

/** Remove this speaker from its current group so it plays standalone. */
export async function groupLeave(speaker: string): Promise<void> {
  const device = await getDeviceByName(speaker);
  await device.AVTransportService.BecomeCoordinatorOfStandaloneGroup();
  // Force re-discovery so the next /api/sonos/speakers call reflects the
  // updated zone-group topology.
  lastDiscoveryAt = 0;
}

/** Dissolve a whole group by making every member standalone. Useful when
 *  the user wants to split a multi-speaker group in one click. */
export async function groupDissolve(coordinatorUdn: string): Promise<void> {
  await ensureManager();
  if (!manager) return;
  const members = manager.Devices.filter(
    (d) => d.Coordinator?.Uuid === coordinatorUdn && d.Uuid !== coordinatorUdn
  );
  await Promise.all(
    members.map((d) => d.AVTransportService.BecomeCoordinatorOfStandaloneGroup().catch(() => undefined))
  );
  lastDiscoveryAt = 0;
}

// ── Diagnostics ─────────────────────────────────────────────────────

export function getDiagnostics(): DiscoveryDiagnostics & { devices: SonosSpeaker[] } {
  const devices: SonosSpeaker[] = manager
    ? manager.Devices.map((d) => ({ name: d.Name, ip: d.Host, udn: d.Uuid }))
    : [];
  return { ...diagnostics, devices };
}

export async function forceRediscover(): Promise<DiscoveryDiagnostics & { devices: SonosSpeaker[] }> {
  await ensureManager(true);
  return getDiagnostics();
}
