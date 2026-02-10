import { NextRequest } from "next/server";

export function isAuthenticated(request: NextRequest): boolean {
  const apiKey = process.env.TUNIFY_API_KEY;
  if (!apiKey) return true; // No key configured = auth disabled

  // Localhost always passes
  const host = request.headers.get("host") || "";
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim();

  if (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]") ||
    ip === "127.0.0.1" ||
    ip === "::1"
  ) {
    return true;
  }

  // Check Bearer token
  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return false;

  return token === apiKey;
}
