import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";
import picker from "./claude-element-picker/src/astro.mjs";

export default defineConfig({
  site: "https://vishnubharath.com",
  output: "static",
  // Dev-only element picker → Claude (see claude-element-picker/README.md).
  // No-op outside `astro dev`; nothing ships to production.
  integrations: [picker()],
  // Custom Worker entrypoint adds a scheduled() cron handler for the /news feed
  // refresh alongside Astro's fetch handler (see src/worker.ts).
  adapter: cloudflare({ workerEntryPoint: { path: "src/worker.ts" } })
});