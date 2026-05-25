import { NextRequest, NextResponse } from "next/server";
import {
  KEY_REGISTRY,
  getSetting,
  setSetting,
  deleteSetting,
  maskSecret,
} from "@/lib/app-settings";

/**
 * GET /api/settings/keys
 *
 * Returns the configured-status + masked value for every key in the
 * registry. Never returns plaintext secrets. Source is "db" if the
 * value lives in app_settings, "env" if only the env var is set,
 * or "none" when neither is configured.
 *
 * Shape: { keys: { [registryName]: { source, value, label, secret } } }
 */
export async function GET() {
  const out: Record<
    string,
    { source: "db" | "env" | "none"; value: string | null; label: string; secret: boolean }
  > = {};

  for (const [name, spec] of Object.entries(KEY_REGISTRY)) {
    const dbVal = getSetting(spec.dbKey);
    const envVal = process.env[spec.envName] || null;
    let source: "db" | "env" | "none" = "none";
    let raw: string | null = null;
    if (dbVal) {
      source = "db";
      raw = dbVal;
    } else if (envVal) {
      source = "env";
      raw = envVal;
    }
    out[name] = {
      source,
      value: spec.secret ? maskSecret(raw) : raw,
      label: spec.label,
      secret: spec.secret,
    };
  }

  return NextResponse.json({ keys: out });
}

/**
 * PUT /api/settings/keys
 *
 * Body: { key: <registryName>, value: <string> }
 * — or — { updates: { [registryName]: value, ... } } for batch updates.
 *
 * Empty string clears the DB row (env fallback re-applies on next read).
 * Refuses to persist a string that's already a mask (●●●●xxxx) so a stale
 * GET → PUT round-trip can't accidentally wipe the real value.
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();

  const updates: Record<string, string> = body.updates
    ? body.updates
    : body.key
    ? { [body.key]: String(body.value ?? "") }
    : {};

  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const [name, value] of Object.entries(updates)) {
    const spec = KEY_REGISTRY[name];
    if (!spec) {
      rejected.push(`${name}: unknown key`);
      continue;
    }
    const v = String(value ?? "");
    if (v.includes("●")) {
      rejected.push(`${name}: masked value, ignored`);
      continue;
    }
    setSetting(spec.dbKey, v);
    accepted.push(name);
  }

  return NextResponse.json({ accepted, rejected });
}

/**
 * DELETE /api/settings/keys?key=<registryName>
 *
 * Clears the DB row so the env-var fallback (if any) re-applies.
 */
export async function DELETE(request: NextRequest) {
  const name = new URL(request.url).searchParams.get("key");
  if (!name) {
    return NextResponse.json({ error: "key query param required" }, { status: 400 });
  }
  const spec = KEY_REGISTRY[name];
  if (!spec) {
    return NextResponse.json({ error: `unknown key: ${name}` }, { status: 400 });
  }
  deleteSetting(spec.dbKey);
  return NextResponse.json({ cleared: name });
}
