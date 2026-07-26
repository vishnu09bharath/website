// Astro integration for the Claude element picker.
//
// Add to astro.config.* `integrations: [picker()]`. In `astro dev` it:
//   1. enables the dev toolbar (so Astro emits data-astro-source-* attributes
//      the picker needs to map a clicked element back to its source line), and
//   2. injects a tiny loader that pulls the picker client from the MCP server.
//
// It does NOTHING during `astro build` / `astro preview`, so there is zero
// production footprint. The picker server itself is started by Claude Code via
// `.mcp.json` (see README.md), not by this integration.
//
// Options:
//   port  — where the picker server listens (default 7337 / $PICKER_PORT).

export default function picker(opts = {}) {
  const port = opts.port || Number(process.env.PICKER_PORT) || 7337;
  return {
    name: "claude-element-picker",
    hooks: {
      "astro:config:setup": ({ command, updateConfig, injectScript, logger }) => {
        if (command !== "dev") return; // dev-only — no prod footprint

        updateConfig({ devToolbar: { enabled: true } });

        injectScript(
          "page",
          "if(!window.__pickerInjected){window.__pickerInjected=1;" +
            "var s=document.createElement('script');" +
            "s.src='http://localhost:" + port + "/picker.js';" +
            "document.head.appendChild(s);}"
        );

        logger.info("element picker active — start Claude Code so the MCP server listens on :" + port);
      },
    },
  };
}
