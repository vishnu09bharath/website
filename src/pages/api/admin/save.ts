import type { APIRoute } from "astro";
import { saveSite } from "../../../data/site";
import { getAdmin } from "../../../lib/auth";

export const prerender = false;

const num = (v: FormDataEntryValue | null): number => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : NaN;
};

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = (locals as any).runtime?.env ?? {};
  const login = await getAdmin(cookies, env);
  if (!login) return new Response("Unauthorized", { status: 401 });

  const f = await request.formData();
  const input = {
    banner: {
      enabled: f.get("bannerEnabled") === "on",
      prefix: String(f.get("bannerPrefix") ?? ""),
      text: String(f.get("bannerText") ?? ""),
      linkLabel: String(f.get("bannerLinkLabel") ?? ""),
      linkHref: String(f.get("bannerLinkHref") ?? ""),
    },
    travel: {
      home: {
        label: String(f.get("homeLabel") ?? ""),
        lat: num(f.get("homeLat")),
        lon: num(f.get("homeLon")),
        timezone: String(f.get("homeTz") ?? ""),
      },
      destination: {
        label: String(f.get("destLabel") ?? ""),
        lat: num(f.get("destLat")),
        lon: num(f.get("destLon")),
      },
      arrival: String(f.get("arrival") ?? ""),
    },
  };

  try {
    await saveSite(env, input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid input";
    return redirect("/admin?error=" + encodeURIComponent(msg.slice(0, 300)));
  }
  return redirect("/admin?saved=1");
};
