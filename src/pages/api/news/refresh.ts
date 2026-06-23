import type { APIRoute } from "astro";
import { getAdmin } from "../../../lib/auth";
import { buildFeed } from "../../../lib/news";

export const prerender = false;

// Force a feed rebuild (the dashboard's Refresh button). Auth-gated like the
// admin endpoints; returns the fresh feed as JSON.
export const POST: APIRoute = async ({ locals, cookies }) => {
  const env = (locals as any).runtime?.env ?? {};
  const login = await getAdmin(cookies, env);
  if (!login) return new Response("Unauthorized", { status: 401 });

  const feed = await buildFeed(env);
  return new Response(JSON.stringify(feed), {
    headers: { "content-type": "application/json" },
  });
};
