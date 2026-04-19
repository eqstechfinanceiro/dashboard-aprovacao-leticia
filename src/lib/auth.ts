/**
 * Minimal single-user session auth for the dashboard.
 *
 * - Credentials are compared against env vars `APP_USER` / `APP_PASSWORD`.
 * - A session cookie holds a HMAC-SHA256 signed payload so we do not need a
 *   database or any external dependency (works on Edge runtime / middleware).
 * - Defaults (user "admin", password "admin") are active ONLY when neither
 *   env var is configured, so the app does not lock the user out of local dev.
 */

export const SESSION_COOKIE = "eqs_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function authConfig() {
  const user = (process.env.APP_USER ?? "").trim() || "admin";
  const password = (process.env.APP_PASSWORD ?? "").trim() || "admin";
  const secret =
    (process.env.APP_SESSION_SECRET ?? "").trim() ||
    `${user}::${password}::dev-default-secret`;
  const usingDefaults =
    !process.env.APP_USER || !process.env.APP_PASSWORD;
  return { user, password, secret, usingDefaults };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 =
    s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

export interface SessionPayload {
  u: string; // user
  iat: number; // issued at (seconds)
  exp: number; // expires at (seconds)
}

export async function signSession(user: string): Promise<string> {
  const { secret } = authConfig();
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    u: user,
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function verifySession(
  token: string | null | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const { secret } = authConfig();
  const expected = await hmac(secret, body);
  if (expected !== sig) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (
      typeof payload.u !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Timing-safe string comparison (works on Edge — no node:crypto required). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
