import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import keystatic from "@keystatic/astro";

export default defineConfig({
  site: "https://vishnubharath.com",
  output: "static",
  devToolbar: { enabled: false },
  integrations: [react(), keystatic()],
  adapter: cloudflare(),
});
