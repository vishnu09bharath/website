import type { APIRoute } from "astro";
import { getAdmin } from "../../../lib/auth";
import { articleSchema, toggleSaved, markRead } from "../../../lib/news";

export const prerender = false;

// Two actions, both auth-gated and called via fetch() from the dashboard:
//   { action: "save", article }  → toggle an article in the saved list
//   { action: "read", id }       → record a click-through (catch-up weighting)
export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = (locals as any).runtime?.env ?? {};
  const login = await getAdmin(cookies, env);
  if (!login) return new Response("Unauthorized", { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (body?.action === "read") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return new Response("Bad request", { status: 400 });
    await markRead(env, id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Default: toggle save.
  const parsed = articleSchema.safeParse(body?.article);
  if (!parsed.success) return new Response("Invalid article", { status: 400 });
  const saved = await toggleSaved(env, parsed.data);
  return new Response(JSON.stringify({ saved }), {
    headers: { "content-type": "application/json" },
  });
};
