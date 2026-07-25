import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://vishnubharath.com",
  output: "static",
  // Custom Worker entrypoint adds a scheduled() cron handler for the /news feed
  // refresh alongside Astro's fetch handler (see src/worker.ts).
  adapter: cloudflare({ workerEntryPoint: { path: "src/worker.ts" } })
});