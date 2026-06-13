// Minimal stateless auth for the /admin panel.
//
// Login is Google OAuth (see /admin/login + /api/auth/callback); on success we
// issue an HMAC-signed cookie holding the verified email + expiry. No database,
// no server-side session store — the signature is the source of truth.
//
// In local dev (`astro dev`) the panel is intentionally open so it can be used
// without configuring OAuth. Production (DEV === false) always requires a valid
// signed session.

import type { AstroCookies } from "astro";

export const SESSION_COOKIE = "admin_session";
export const STATE_COOKIE = "admin_oauth_state";

export type AdminEnv = {
  AUTH_SECRET?: string;
  ALLOWED_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

const enc = new TextEncoder();

function b64urlBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncodeStr(str: string): string {
  return b64urlBytes(enc.encode(str));
}
function b64urlDecodeStr(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(
    Array.from(atob(b64), (c) =>
      "%" + c.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join(""),
  );
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlBytes(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Create a signed session token for a GitHub login. */
export async function createSession(
  subject: string,
  secret: string,
  days = 7,
): Promise<string> {
  const payload = b64urlEncodeStr(
    JSON.stringify({ sub: subject, exp: Date.now() + days * 86_400_000 }),
  );
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

/** Verify a session token; returns the login if valid and unexpired, else null. */
export async function verifySession(
  token: string | undefined,
  secret: string,
): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(b64urlDecodeStr(payload));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return typeof data.sub === "string" ? data.sub : null;
  } catch {
    return null;
  }
}

/**
 * Returns the authenticated admin login, or null. In dev the panel is open
 * (returns "dev"); in production a valid signed session is required.
 */
export async function getAdmin(
  cookies: AstroCookies,
  env: AdminEnv | undefined,
): Promise<string | null> {
  if (import.meta.env.DEV) return "dev";
  const secret = env?.AUTH_SECRET;
  if (!secret) return null;
  return verifySession(cookies.get(SESSION_COOKIE)?.value, secret);
}

export function randomToken(): string {
  return b64urlBytes(crypto.getRandomValues(new Uint8Array(24)));
}
