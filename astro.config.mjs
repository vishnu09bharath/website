import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://vishnubharath.com",
  devToolbar: {
    enabled: false
  },
  vite: {
    define: {
      __BUILD_DATE__: JSON.stringify(new Date().toISOString())
    }
  }
});
