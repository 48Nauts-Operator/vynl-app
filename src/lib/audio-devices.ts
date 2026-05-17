import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);
const SWITCH_AUDIO = "/opt/homebrew/bin/SwitchAudioSource";

// Only macOS Homebrew installs this binary. In Linux/Docker (NAS), CI,
// or any Mac without the brew package, it's absent. Cache the presence
// check so we don't stat the disk on every request.
let switchAudioAvailable: boolean | null = null;
function isSwitchAudioAvailable(): boolean {
  if (switchAudioAvailable === null) switchAudioAvailable = existsSync(SWITCH_AUDIO);
  return switchAudioAvailable;
}

export type DeviceType = "bluetooth" | "builtin" | "monitor" | "virtual" | "airplay" | "other";

export interface AudioDevice {
  name: string;
  type: DeviceType;
  isCurrent: boolean;
}

function classifyDevice(name: string): DeviceType {
  const lower = name.toLowerCase();
  if (lower.includes("bluetooth") || lower.includes("airpods") || lower.includes("beats") || lower.includes("bose") || lower.includes("sony wh") || lower.includes("jabra") || lower.includes("drebeets")) {
    return "bluetooth";
  }
  if (lower.includes("macbook speakers") || lower.includes("mac studio speakers") || lower.includes("mac mini speakers") || lower.includes("mac pro speakers") || lower.includes("built-in")) {
    return "builtin";
  }
  if (lower.includes("airplay") || lower.includes("homepod")) {
    return "airplay";
  }
  if (lower.includes("blackhole") || lower.includes("aggregate") || lower.includes("multi-output") || lower.includes("soundflower") || lower.includes("loopback")) {
    return "virtual";
  }
  if (lower.includes("monitor") || lower.includes("display") || lower.includes("hdmi") || lower.includes("lg ") || lower.includes("dell ") || lower.includes("samsung") || lower.includes("smart monitor") || /^ls\d/i.test(lower)) {
    return "monitor";
  }
  return "other";
}

async function switchAudioExec(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(SWITCH_AUDIO, args, { timeout: 5000 });
    return stdout.trim();
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(`SwitchAudioSource failed: ${error.stderr || error.message}`);
  }
}

export async function listOutputDevices(): Promise<AudioDevice[]> {
  if (!isSwitchAudioAvailable()) return [];

  const [deviceList, current] = await Promise.all([
    switchAudioExec(["-a", "-t", "output"]),
    switchAudioExec(["-c", "-t", "output"]),
  ]);

  const currentDevice = current.trim();
  const devices = deviceList
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      type: classifyDevice(name),
      isCurrent: name === currentDevice,
    }));

  return devices;
}

export async function getCurrentDevice(): Promise<string> {
  if (!isSwitchAudioAvailable()) return "";
  return switchAudioExec(["-c", "-t", "output"]);
}

export async function switchDevice(name: string): Promise<void> {
  if (!isSwitchAudioAvailable()) {
    throw new Error("System audio device switching is only available on macOS with SwitchAudioSource installed.");
  }
  await switchAudioExec(["-s", name, "-t", "output"]);
}
