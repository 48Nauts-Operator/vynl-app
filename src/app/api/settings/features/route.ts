/**
 * GET / PUT /api/settings/features
 *
 * Boolean feature toggles persisted in app_settings. Separate from
 * /api/settings/keys, which is strictly for credential strings.
 *
 * Known features (add new ones to FEATURE_REGISTRY):
 *   manualEdit  — gates the Library editing UI + the metadata PATCH endpoints
 *
 * GET  returns: { features: { [name]: { enabled: bool, label, description } } }
 * PUT  body:    { name: "manualEdit", enabled: true }   (single)
 *           or  { updates: { [name]: bool, ... } }      (bulk)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/app-settings";

interface FeatureSpec {
  dbKey: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const FEATURE_REGISTRY: Record<string, FeatureSpec> = {
  manualEdit: {
    dbKey: "manual_edit_enabled",
    label: "Allow metadata editing",
    description:
      "When on, the 3-dot menu on tracks and albums shows 'Edit metadata' actions. Edits are tracked. Off by default to prevent accidental changes.",
    defaultEnabled: false,
  },
};

function isEnabled(spec: FeatureSpec): boolean {
  const v = getSetting(spec.dbKey);
  if (v === null) return spec.defaultEnabled;
  return v === "1" || v === "true";
}

export async function GET() {
  const out: Record<string, { enabled: boolean; label: string; description: string }> = {};
  for (const [name, spec] of Object.entries(FEATURE_REGISTRY)) {
    out[name] = {
      enabled: isEnabled(spec),
      label: spec.label,
      description: spec.description,
    };
  }
  return NextResponse.json({ features: out });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const updates: Record<string, boolean> = body.updates
    ? body.updates
    : body.name !== undefined
      ? { [body.name]: Boolean(body.enabled) }
      : {};

  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const [name, value] of Object.entries(updates)) {
    const spec = FEATURE_REGISTRY[name];
    if (!spec) {
      rejected.push(`${name}: unknown feature`);
      continue;
    }
    setSetting(spec.dbKey, value ? "1" : "0");
    accepted.push(name);
  }

  return NextResponse.json({ accepted, rejected });
}
