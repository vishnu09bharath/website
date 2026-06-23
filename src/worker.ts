// Custom Cloudflare Worker entrypoint.
//
// The @astrojs/cloudflare adapter normally generates the Worker from its own
// server entrypoint. We replace it (via `workerEntryPoint` in astro.config.mjs)
// so we can add a `scheduled()` handler alongside Astro's `fetch()` — that's the
// cron half of the news refresh (wrangler.jsonc runs it every 30 min, keeping
// the feed warm even when nobody visits). The fetch half (rebuild on open) lives
// in getFeed().
//
// Astro injects the SSR manifest and calls createExports(manifest); we delegate
// fetch to the adapter's standard server export and merge in scheduled().

import type { SSRManifest } from "astro";
// @ts-ignore - published JS entrypoint, no bundled types
import { createExports as createServerExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { buildFeed, type NewsEnv } from "./lib/news";

export function createExports(manifest: SSRManifest) {
  const { default: server } = createServerExports(manifest);
  return {
    default: {
      fetch: server.fetch,
      async scheduled(_event: unknown, env: NewsEnv, ctx: { waitUntil(p: Promise<unknown>): void }) {
        ctx.waitUntil(buildFeed(env));
      },
    },
  };
}
