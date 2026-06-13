import { z } from "astro:content";
import data from "./site.json";

// Single source of truth for the semi-regularly edited content on the site
// (the landing-page banner and the globe's travel plan). Edit site.json, commit,
// and Cloudflare redeploys. The schema below validates the JSON at build time,
// so a bad edit (e.g. a malformed date or out-of-range coordinate) fails the
// build with a clear error instead of shipping broken content.
//
// Designed to be CMS-friendly (Avenue B): point a git-based CMS at site.json
// with fields matching this schema. To move to a runtime store later (Avenue C),
// swap the `data` import for a fetch and keep the rest of the app reading from
// the `banner` / `travel` exports below.

const location = z.object({
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const schema = z.object({
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

const site = schema.parse(data);

export const banner = site.banner;
export const travel = site.travel;
export type Site = typeof site;
