// Diagnostic checks for Vynl's runtime environment. Used by the Flight
// Check panel in /settings to quickly surface what's broken or
// misconfigured (missing env vars, ffmpeg absent, beets plugins not set,
// etc.) without having to read logs.

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getActiveSettings, testConnection } from "@/lib/llm";

const execFileAsync = promisify(execFile);

export type CheckStatus = "ok" | "warn" | "error" | "info";

export interface Check {
  id: string;
  category: "core" | "audio" | "ai" | "integrations" | "library";
  label: string;
  status: CheckStatus;
  message: string;
  hint?: string;
}

async function tryExec(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 4000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

function checkDatabase(): Check {
  try {
    const result = db.all(sql`SELECT COUNT(*) as n FROM tracks`) as { n: number }[];
    const count = result[0]?.n ?? 0;
    return {
      id: "db",
      category: "core",
      label: "SQLite database",
      status: "ok",
      message: `${count.toLocaleString()} tracks indexed`,
    };
  } catch (err) {
    return {
      id: "db",
      category: "core",
      label: "SQLite database",
      status: "error",
      message: err instanceof Error ? err.message : "Database unreachable",
    };
  }
}

function checkMusicLibrary(): Check {
  const libPath = process.env.MUSIC_LIBRARY_PATH;
  if (!libPath) {
    return {
      id: "music-lib",
      category: "library",
      label: "Music library path",
      status: "warn",
      message: "MUSIC_LIBRARY_PATH env var is not set",
      hint: "Set it in docker-compose / .env.local so Vynl knows where to scan.",
    };
  }
  if (!fs.existsSync(libPath)) {
    return {
      id: "music-lib",
      category: "library",
      label: "Music library path",
      status: "error",
      message: `Path does not exist: ${libPath}`,
      hint: "Mount or fix the path. On Docker this is usually a bind mount in your compose file.",
    };
  }
  try {
    fs.accessSync(libPath, fs.constants.R_OK);
  } catch {
    return {
      id: "music-lib",
      category: "library",
      label: "Music library path",
      status: "error",
      message: `Path exists but is not readable: ${libPath}`,
    };
  }
  return {
    id: "music-lib",
    category: "library",
    label: "Music library path",
    status: "ok",
    message: libPath,
  };
}

async function checkFfmpeg(): Promise<Check> {
  const out = await tryExec("ffmpeg", ["-version"]);
  if (!out) {
    return {
      id: "ffmpeg",
      category: "audio",
      label: "ffmpeg",
      status: "warn",
      message: "Not installed or not on PATH",
      hint: "macOS: `brew install ffmpeg`. Linux: `apt-get install ffmpeg`. FLAC/WAV/AIFF playback on Sonos requires this.",
    };
  }
  const versionLine = out.split("\n")[0] || "";
  return {
    id: "ffmpeg",
    category: "audio",
    label: "ffmpeg",
    status: "ok",
    message: versionLine.slice(0, 60),
  };
}

async function checkBeets(): Promise<Check[]> {
  const out = await tryExec("beet", ["version"]);
  if (!out) {
    return [
      {
        id: "beets",
        category: "library",
        label: "beets",
        status: "warn",
        message: "Not installed or not on PATH",
        hint: "Install with `pip install beets`. Needed for auto-tagging during library scan.",
      },
    ];
  }

  // Find the config file beets is using.
  const configOut = await tryExec("beet", ["config", "-p"]);
  const configPath = configOut?.trim();
  let pluginsLine: string | null = null;
  if (configPath && fs.existsSync(configPath)) {
    try {
      const yaml = fs.readFileSync(configPath, "utf-8");
      const match = yaml.match(/^plugins:\s*(.+)$/m);
      pluginsLine = match?.[1]?.trim() ?? null;
    } catch {
      // ignore
    }
  }

  const versionCheck: Check = {
    id: "beets",
    category: "library",
    label: "beets",
    status: "ok",
    message: out.split("\n")[0]?.slice(0, 60) || "installed",
  };

  if (pluginsLine === null) {
    return [
      versionCheck,
      {
        id: "beets-plugins",
        category: "library",
        label: "beets plugins",
        status: "warn",
        message: "Could not read plugins from beets config",
        hint: configPath ? `Checked ${configPath}` : "Run `beet config -p` to locate config",
      },
    ];
  }

  const plugins = pluginsLine.split(/\s+/).filter(Boolean);
  const recommended = ["lastgenre", "mbsync", "fetchart", "embedart"];
  const missing = recommended.filter((p) => !plugins.includes(p));

  return [
    versionCheck,
    {
      id: "beets-plugins",
      category: "library",
      label: "beets plugins",
      status: missing.length === 0 ? "ok" : "warn",
      message:
        missing.length === 0
          ? `All recommended plugins enabled: ${plugins.join(", ")}`
          : `Missing: ${missing.join(", ")}. Enabled: ${plugins.join(", ")}`,
      hint:
        missing.length === 0
          ? undefined
          : `Add to plugins line in beets config. Without 'lastgenre', genres are not fetched during import — that's how albums end up with wrong genres from original ID3 tags.`,
    },
  ];
}

async function checkSharp(): Promise<Check> {
  try {
    // Dynamic import so this still works in environments without sharp.
    const mod = await import("sharp").catch(() => null);
    if (!mod) {
      return {
        id: "sharp",
        category: "audio",
        label: "sharp (image optimization)",
        status: "error",
        message: "Not installed — cover art will 400 in production",
        hint: "Run `npm install sharp` and restart. Required for Next image optimization in standalone mode.",
      };
    }
    return {
      id: "sharp",
      category: "audio",
      label: "sharp (image optimization)",
      status: "ok",
      message: "Installed",
    };
  } catch (err) {
    return {
      id: "sharp",
      category: "audio",
      label: "sharp (image optimization)",
      status: "error",
      message: err instanceof Error ? err.message : "Failed to load",
    };
  }
}

async function checkLLM(): Promise<Check> {
  const s = getActiveSettings();
  const needsKey = s.provider === "anthropic" || s.provider === "openrouter";
  if (needsKey && !s.apiKey) {
    return {
      id: "llm",
      category: "ai",
      label: `LLM (${s.provider})`,
      status: "warn",
      message: "API key not set",
      hint: "Configure in Settings → LLM Provider.",
    };
  }
  if (!needsKey && !s.endpoint) {
    return {
      id: "llm",
      category: "ai",
      label: `LLM (${s.provider})`,
      status: "warn",
      message: "Endpoint not set",
      hint: "Configure in Settings → LLM Provider.",
    };
  }
  const result = await testConnection(s);
  return {
    id: "llm",
    category: "ai",
    label: `LLM (${s.provider}/${s.model})`,
    status: result.ok ? "ok" : "error",
    message: result.ok ? "Connection OK" : result.error?.slice(0, 100) || "Connection failed",
  };
}

function checkSpotify(): Check {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    return {
      id: "spotify",
      category: "integrations",
      label: "Spotify credentials",
      status: "info",
      message: "Not configured (optional)",
      hint: "Set SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in env to enable Spotify search and library import.",
    };
  }
  return {
    id: "spotify",
    category: "integrations",
    label: "Spotify credentials",
    status: "ok",
    message: `client_id ${id.slice(0, 8)}…`,
  };
}

async function checkSonos(): Promise<Check> {
  // Lazy import so we don't pull in the Sonos lib unless needed.
  try {
    const sonos = await import("@/lib/sonos");
    const diag = sonos.getDiagnostics();
    if (diag.method === "none" && diag.deviceCount === 0) {
      // Not attempted yet — quick non-blocking call
      const speakers = await sonos.discover();
      if (speakers.length === 0) {
        return {
          id: "sonos",
          category: "integrations",
          label: "Sonos discovery",
          status: "warn",
          message: "No speakers found",
          hint:
            "If you have Sonos on the LAN, the container needs network_mode: host (SSDP needs multicast). Or set SONOS_SEED_IP to one known speaker IP.",
        };
      }
      return {
        id: "sonos",
        category: "integrations",
        label: "Sonos discovery",
        status: "ok",
        message: `${speakers.length} speaker${speakers.length === 1 ? "" : "s"} (SSDP)`,
      };
    }
    return {
      id: "sonos",
      category: "integrations",
      label: "Sonos discovery",
      status: diag.deviceCount > 0 ? "ok" : "warn",
      message:
        diag.deviceCount > 0
          ? `${diag.deviceCount} speaker${diag.deviceCount === 1 ? "" : "s"} (${diag.method})`
          : "No speakers found",
    };
  } catch (err) {
    return {
      id: "sonos",
      category: "integrations",
      label: "Sonos discovery",
      status: "error",
      message: err instanceof Error ? err.message : "Sonos check failed",
    };
  }
}

function checkGitHubPat(): Check {
  const set = Boolean(process.env.GH_STATS_PAT);
  return {
    id: "github-pat",
    category: "integrations",
    label: "GitHub PAT (Traffic stats)",
    status: set ? "ok" : "info",
    message: set ? "Set" : "Not set (optional — /github-stats works without it, just no Traffic panel)",
  };
}

function checkAnthropicEnv(): Check {
  const set = Boolean(process.env.ANTHROPIC_API_KEY);
  return {
    id: "anthropic-env",
    category: "ai",
    label: "ANTHROPIC_API_KEY env",
    status: set ? "ok" : "info",
    message: set ? "Set" : "Not in env (settings DB value will be used instead)",
  };
}

export async function runFlightCheck(): Promise<Check[]> {
  const [
    dbCheck,
    music,
    ffmpeg,
    beets,
    sharpCheck,
    llm,
    sonosResult,
  ] = await Promise.all([
    Promise.resolve(checkDatabase()),
    Promise.resolve(checkMusicLibrary()),
    checkFfmpeg(),
    checkBeets(),
    checkSharp(),
    checkLLM(),
    checkSonos(),
  ]);

  return [
    dbCheck,
    music,
    ffmpeg,
    ...beets,
    sharpCheck,
    llm,
    checkAnthropicEnv(),
    sonosResult,
    checkSpotify(),
    checkGitHubPat(),
  ];
}
