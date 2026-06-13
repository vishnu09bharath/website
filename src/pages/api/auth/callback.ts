import type { APIRoute } from "astro";
import { SESSION_COOKIE, STATE_COOKIE, createSession } from "../../../lib/auth";

export const prerender = false;

// Decode a JWT payload (no signature check needed — the id_token comes straight
// from Google's token endpoint over TLS in our server-to-server exchange).
function decodeJwtPayload(jwt: string): any {
  const part = jwt.split(".")[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    Array.from(atob(b64), (c) =>
      "%" + c.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join(""),
  );
  return JSON.parse(json);
}

export const GET: APIRoute = async ({ locals, cookies, url, redirect }) => {
  const env = (locals as any).runtime?.env ?? {};
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, ALLOWED_EMAIL } =
    env as Record<string, string | undefined>;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return redirect("/login-failed/?reason=state");
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !AUTH_SECRET || !ALLOWED_EMAIL) {
    return redirect("/login-failed/?reason=config");
  }

  // Exchange the code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tokenJson: any = await tokenRes.json().catch(() => ({}));
  const idToken = tokenJson.id_token as string | undefined;
  if (!idToken) return redirect("/login-failed/?reason=token");

  const claims = decodeJwtPayload(idToken);
  const email: string | undefined = claims?.email;
  const verified =
    claims?.email_verified === true || claims?.email_verified === "true";
  if (!email || !verified || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    return redirect("/login-failed/?reason=unauthorized");
  }

  const token = await createSession(email, AUTH_SECRET, 7);
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 7 * 86400,
  });
  return redirect("/admin");
};
