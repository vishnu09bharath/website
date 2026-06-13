import type { APIRoute } from "astro";
import { STATE_COOKIE, randomToken } from "../../lib/auth";

export const prerender = false;

export const GET: APIRoute = ({ locals, cookies, url, redirect }) => {
  const env = (locals as any).runtime?.env ?? {};
  const clientId = env.GOOGLE_CLIENT_ID as string | undefined;

  // Unconfigured (e.g. local dev): the panel is open via the dev bypass.
  if (!clientId) return redirect("/admin");

  const state = randomToken();
  cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 600,
  });

  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", `${url.origin}/api/auth/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email");
  auth.searchParams.set("state", state);
  auth.searchParams.set("access_type", "online");
  auth.searchParams.set("prompt", "select_account");
  return redirect(auth.toString());
};
