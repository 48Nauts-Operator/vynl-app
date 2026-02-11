import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const SONOS_CLI = "/opt/homebrew/bin/sonos";

export interface SonosSpeaker {
  name: string;
  ip: string;
  udn?: string;
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

async function sonosExec(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(SONOS_CLI, args, { timeout: 10000 });
    return stdout.trim();
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(`Sonos command failed: ${error.stderr || error.message}`);
  }
}

export async function discover(): Promise<SonosSpeaker[]> {
  try {
    const output = await sonosExec(["discover", "--format", "json"]);
    return JSON.parse(output);
  } catch {
    return [];
  }
}

export async function status(speaker?: string): Promise<SonosStatus | null> {
  try {
    const args = ["status", "--format", "json"];
    if (speaker) args.push("--name", speaker);
    const output = await sonosExec(args);
    const data = JSON.parse(output);
    return {
      speaker: speaker || "default",
      state: data.transport?.State || data.state || data.playback_state || data.transport_state || "unknown",
      title: data.nowPlaying?.title || data.title || data.track,
      artist: data.nowPlaying?.artist || data.artist || data.creator,
      album: data.nowPlaying?.album || data.album,
      position: data.position?.RelTime || data.rel_time,
      duration: data.position?.TrackDuration || data.track_duration,
      volume: data.volume !== undefined ? Number(data.volume) : undefined,
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
  const args = ["play-uri", "--name", speaker, uri];
  if (isRadio) args.push("--radio");
  await sonosExec(args);
}

export async function openSpotify(
  speaker: string,
  spotifyUri: string
): Promise<void> {
  await sonosExec(["open", "--name", speaker, spotifyUri]);
}

export async function play(speaker: string): Promise<void> {
  try {
    await sonosExec(["play", "--name", speaker]);
  } catch (err) {
    // UPnP 701 = transition not available (speaker still loading), safe to ignore
    if (String(err).includes("701")) return;
    throw err;
  }
}

export async function pause(speaker: string): Promise<void> {
  try {
    await sonosExec(["pause", "--name", speaker]);
  } catch (err) {
    if (String(err).includes("701")) return;
    throw err;
  }
}

export async function next(speaker: string): Promise<void> {
  await sonosExec(["next", "--name", speaker]);
}

export async function prev(speaker: string): Promise<void> {
  await sonosExec(["prev", "--name", speaker]);
}

export async function setVolume(
  speaker: string,
  volume: number
): Promise<void> {
  await sonosExec(["volume", "set", "--name", speaker, volume.toString()]);
}

export async function getVolume(speaker: string): Promise<number> {
  const output = await sonosExec(["volume", "--name", speaker, "--format", "json"]);
  try {
    const data = JSON.parse(output);
    return data.volume ?? data.level ?? (parseInt(output) || 50);
  } catch {
    return parseInt(output) || 50;
  }
}

export async function groupJoin(
  speaker: string,
  target: string
): Promise<void> {
  await sonosExec(["group", "join", "--name", speaker, "--target", target]);
}

export async function groupParty(speaker: string): Promise<void> {
  await sonosExec(["group", "join", "--name", speaker, "--all"]);
}

export async function searchSpotify(
  query: string,
  limit = 10
): Promise<any[]> {
  const args = ["search", "spotify", query, "--limit", limit.toString(), "--format", "json"];

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (clientId) args.push("--client-id", clientId);
  if (clientSecret) args.push("--client-secret", clientSecret);

  try {
    const output = await sonosExec(args);
    return JSON.parse(output);
  } catch {
    return [];
  }
}
