// Custom Cloudflare Worker entrypoint.
//
// The @astrojs/cloudflare adapter normally generates the Worker from its own
// server entrypoint. We replace it (via `workerEntryPoint` in astro.config.mjs)
// so we can add a `scheduled()` handler alongside Astro's `fetch()`. The cron in
// wrangler.jsonc fires it every 15 min and it runs whichever scheduled tasks are
// due (src/tasks/). Crons only fire when deployed as a Worker — Pages ignores them.
//
// Astro injects the SSR manifest and calls createExports(manifest); we delegate
// fetch to the adapter's standard server export and merge in scheduled().

import type { SSRManifest } from "astro";
// @ts-ignore - published JS entrypoint, no bundled types
import { createExports as createServerExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { runDueTasks } from "./lib/tasks";
import type { TaskEnv } from "./tasks/types";

export function createExports(manifest: SSRManifest) {
  const { default: server } = createServerExports(manifest);
  return {
    default: {
      fetch: server.fetch,
      async scheduled(_event: unknown, env: TaskEnv, ctx: { waitUntil(p: Promise<unknown>): void }) {
        ctx.waitUntil(runDueTasks(env));
      },
    },
  };
}
