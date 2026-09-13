import { defineConfig } from "astro/config";
import { execSync } from "node:child_process";

import cloudflare from "@astrojs/cloudflare";
import picker from "./claude-element-picker/src/astro.mjs";

// Commit this build came from, shown on the /admin Overview (src/lib/build-info.ts).
// Workers Builds provides WORKERS_CI_COMMIT_SHA; locally fall back to git.
function commitSha() {
  if (process.env.WORKERS_CI_COMMIT_SHA) return process.env.WORKERS_CI_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  site: "https://vishnubharath.com",
  output: "static",
  // Dev-only element picker → Claude (see claude-element-picker/README.md).
  // No-op outside `astro dev`; nothing ships to production.
  integrations: [picker()],
  // Custom Worker entrypoint adds a scheduled() cron handler for the /news feed
  // refresh alongside Astro's fetch handler (see src/worker.ts).
  adapter: cloudflare({ workerEntryPoint: { path: "src/worker.ts" } }),
  vite: {
    define: {
      __BUILD_INFO__: JSON.stringify({ sha: commitSha(), builtAt: Date.now() }),
    },
  },
});