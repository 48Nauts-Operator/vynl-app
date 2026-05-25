import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Runtime-editable settings store. Backs Settings → API Keys so the
 * user can paste credentials and have them take effect without editing
 * .env.local + restarting the container.
 *
 * Read order is DB first, env var fallback — env-set values remain
 * backward compatible. Set a value via setSetting() to override the env.
 */

/** Get a setting value, or null if neither DB nor env has it. */
export function getSetting(key: string): string | null {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row?.value ?? null;
}

/**
 * Get a setting value, preferring DB but falling back to the named env var.
 * Use this in code that previously read directly from process.env.
 */
export function getSettingOrEnv(key: string, envName: string): string | null {
  const dbVal = getSetting(key);
  if (dbVal !== null && dbVal !== "") return dbVal;
  const envVal = process.env[envName];
  return envVal ? envVal : null;
}

/** Upsert a setting. Empty string clears the DB entry (env fallback returns). */
export function setSetting(key: string, value: string): void {
  if (value === "") {
    deleteSetting(key);
    return;
  }
  db.insert(appSettings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
    .run();
}

/** Remove a setting (env fallback applies on next read). */
export function deleteSetting(key: string): void {
  db.delete(appSettings).where(eq(appSettings.key, key)).run();
}

/** Mask a secret for safe display in GET responses. Keeps the last 4 chars. */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "●".repeat(value.length);
  return "●".repeat(Math.min(value.length - 4, 12)) + value.slice(-4);
}

/**
 * Registry of keys exposed through Settings → API Keys.
 * - dbKey: stable name stored in app_settings table.
 * - envName: legacy env var checked when DB has no value.
 * - secret: when true, the GET endpoint returns the value masked.
 * - label: human-readable label (only used by the API for UI hints).
 */
export interface KeySpec {
  dbKey: string;
  envName: string;
  secret: boolean;
  label: string;
}

export const KEY_REGISTRY: Record<string, KeySpec> = {
  anthropic: {
    dbKey: "anthropic_api_key",
    envName: "ANTHROPIC_API_KEY",
    secret: true,
    label: "Anthropic API Key",
  },
  replicate: {
    dbKey: "replicate_api_token",
    envName: "REPLICATE_API_TOKEN",
    secret: true,
    label: "Replicate API Token",
  },
  acoustid: {
    dbKey: "acoustid_api_key",
    envName: "ACOUSTID_API_KEY",
    secret: true,
    label: "AcoustID API Key",
  },
  spotifyClientId: {
    dbKey: "spotify_client_id",
    envName: "SPOTIFY_CLIENT_ID",
    secret: false,
    label: "Spotify Client ID",
  },
  spotifyClientSecret: {
    dbKey: "spotify_client_secret",
    envName: "SPOTIFY_CLIENT_SECRET",
    secret: true,
    label: "Spotify Client Secret",
  },
  spotifyRedirectUri: {
    dbKey: "spotify_redirect_uri",
    envName: "SPOTIFY_REDIRECT_URI",
    secret: false,
    label: "Spotify Redirect URI",
  },
  youtube: {
    dbKey: "youtube_api_key",
    envName: "YOUTUBE_API_KEY",
    secret: true,
    label: "YouTube API Key",
  },
};
