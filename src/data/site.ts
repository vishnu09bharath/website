import { z } from "astro:content";
import seed from "./site.json";

// Editable site content (landing-page banner + globe travel plan), Avenue C:
// stored in a Cloudflare KV namespace and read at request time, so edits made in
// the /admin panel go live instantly — no rebuild, no git push. site.json is the
// seed/fallback used before the first edit (and if KV is ever unavailable). The
// zod schema validates every read and every write, so bad data can never be
// stored or rendered.

const location = z.object({
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const siteSchema = z.object({
  banner: z.object({
    enabled: z.boolean(),
    prefix: z.string().default(""),
    text: z.string().min(1),
    linkLabel: z.string().min(1),
    linkHref: z.string().url(),
  }),
  travel: z.object({
    home: location.extend({ timezone: z.string().min(1) }),
    destination: location,
    // Arrival date as YYYY-MM-DD (the globe counts down to this).
    arrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  }),
});

export type Site = z.infer<typeof siteSchema>;

// Validated default, baked from site.json at build time.
export const defaults: Site = siteSchema.parse(seed);

const KEY = "site";

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
export type SiteEnv = { SITE_KV?: KV } | undefined;

/** Read current content from KV, falling back to the seed defaults. */
export async function getSite(env: SiteEnv): Promise<Site> {
  const kv = env?.SITE_KV;
  if (kv) {
    try {
      const raw = await kv.get(KEY);
      if (raw) return siteSchema.parse(JSON.parse(raw));
    } catch {
      // Malformed/partial stored value — fall back to defaults rather than 500.
    }
  }
  return defaults;
}

/** Validate and persist new content to KV. Throws (ZodError) on invalid input. */
export async function saveSite(
  env: { SITE_KV?: KV },
  input: unknown,
): Promise<Site> {
  const parsed = siteSchema.parse(input);
  if (!env.SITE_KV) throw new Error("SITE_KV binding is not configured");
  await env.SITE_KV.put(KEY, JSON.stringify(parsed, null, 2));
  return parsed;
}
