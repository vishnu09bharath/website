# claude-element-picker

Click an element in your dev preview → Claude Code edits its source.

A dev-only visual element picker that feeds the element you click (its **source
file + line**, tag, classes, text, computed styles, outerHTML, and an optional
note) into Claude Code through an MCP tool. Zero dependencies. Nothing ships to
production.

![pick an element, it lands in Claude](#) <!-- add a gif here -->

---

## How it works

Three processes; the **browser is the wire** between them:

```
Browser (your dev server)  ──POST /selections──▶  picker server   ◀──MCP tool──  Claude Code
  client.js (injected, dev)      :7337 (HTTP)      holds selection      (stdio)
```

- **`src/client.js`** — injected into pages in dev. Toggle pick mode (the **pick**
  button or ⌘⇧E / Ctrl⇧E), hover to highlight, click to add elements to a tray.
  Selected elements stay outlined with numbered badges; each tray item has a
  **shot** button to attach a screenshot and a note field. Posts the selection
  back to the server it was loaded from. The UI inherits the host site's design
  tokens (see Theming).
- **`src/server.mjs`** — zero-dep, dual-faced: an HTTP face (`127.0.0.1:7337`)
  that serves `client.js` and receives selections, and an MCP/stdio face that
  Claude Code connects to.
- **`src/astro.mjs`** — an Astro integration that wires the above into a host
  project in dev only.

Source mapping uses Astro's `data-astro-source-file` / `data-astro-source-loc`
attributes, which Astro emits only when the dev toolbar is enabled — the
integration enables it in dev and the picker hides the toolbar UI.

---

## Integrating into a host repo

Two integration points. That's it.

### 1. Wire the client (Astro)

```js
// astro.config.mjs
import picker from "./claude-element-picker/src/astro.mjs"; // local folder
// (after publishing: import picker from "claude-element-picker")

export default defineConfig({
  integrations: [picker()],
});
```

The integration enables the dev toolbar and injects the client — **only during
`astro dev`**. `astro build` / `astro preview` get nothing.

### 2. Register the MCP server

One command (writes/merges the right config for your client — `claude`, `cursor`,
`vscode`, or `windsurf`):

```sh
node claude-element-picker/src/cli.mjs config claude
```

Or for Claude Code specifically you can use its own CLI:

```sh
claude mcp add picker --scope project -- node claude-element-picker/src/server.mjs
```

Either writes the MCP config (e.g. `.mcp.json` at the repo root). Reload the
client and approve the server; that both connects the tool and starts the HTTP
server on :7337.

That's the entire host footprint: one line in `astro.config`, one `.mcp.json`
entry. Nothing else in the host repo references the picker.

---

## Using it

1. Run your dev server (`npm run dev`).
2. Make sure Claude Code is running (it starts the picker server).
3. Open the site, hit **◎ pick** (or ⌘⇧E). Hover shows a highlight + `file:line`
   label; click adds the element. Add a per-element **note**, or hit **📷** to
   attach a screenshot. **Esc** exits pick mode.
4. In Claude Code, refer to "the selected element(s)" — Claude calls
   `get_selected_elements` and edits the right file.

### MCP tools

| Tool | Purpose |
|---|---|
| `get_selected_elements` | Return the current selection(s): source location + kind (component/page/layout), tag, text, styles, html, notes, and any screenshots (as images) |
| `clear_selected_elements` | Empty the selection |

`get_selected_elements` takes optional detail knobs so Claude can control payload
size:

| Param | Values | Default | Meaning |
|---|---|---|---|
| `cssLevel` | 0 / 1 / 2 | 1 | none / key styles / full computed styles |
| `textDetail` | 0 / 1 / 2 | 1 | none / truncated / full visible text |
| `includeHtml` | boolean | true | include element outerHTML |

### Screenshots

The **shot** button lazy-loads [html2canvas](https://html2canvas.hertzen.com/)
from a CDN (dev-only, on demand — no package dependency) to rasterize the
element, and posts it to the server. `get_selected_elements` then returns it as
an image so Claude can *see* the element. Cross-origin images on the page may
render blank (canvas tainting); everything else is captured.

Screenshots are **consume-on-read**: once delivered to the agent they're dropped
server-side, so repeat `get_selected_elements` calls don't re-send (and re-bill)
the image. The lightweight selection context (file/line/styles/note) stays until
you remove it or call `clear_selected_elements`. Re-click **shot** to re-attach.

### Theming

The picker reads the host site's CSS custom properties — `--bg`, `--fg`,
`--muted`, `--rule`, and the body font — and styles itself to match (falling back
to a neutral dark theme if those vars aren't defined). It uses the same
conventions as a minimal site: 1px rule borders, 2px radius, uppercase
letter-spaced labels, and an inverted active state. Drop it on a site that
defines those vars and it adapts automatically.

---

## Configuration

- **Port** — defaults to `7337`. Override with the `PICKER_PORT` env var (set it
  in `.mcp.json`'s `env`) and pass the same value to the integration:
  `picker({ port: 1234 })`. The client auto-derives its endpoint from its own
  script URL, so it needs no port config.

---

## Using it on non-Astro projects

The **server is framework-agnostic** — it only needs elements in the DOM to
carry `data-astro-source-file` / `data-astro-source-loc` (or equivalent) so the
client can map clicks to source.

- **Vite (React / Vue / Svelte / Solid):** add
  [`code-inspector-plugin`](https://github.com/zh-lx/code-inspector), which
  injects the same kind of source-location attributes, then inject `client.js`
  yourself (dev only) and register the server as above.
- **No source attributes available:** the picker still captures route, tag,
  classes, text, and outerHTML — enough for Claude to locate the element by
  grepping, just without an exact line number.

Manual injection (any framework), dev only:

```html
<script src="http://localhost:7337/picker.js"></script>
```

---

## Production safety

The integration is a no-op outside `astro dev`, the source attributes only exist
in dev, and the servers run locally — never on your host. Verify in a host repo:

```sh
npm run build && grep -r "7337\|picker.js\|astro-source" dist/   # → nothing
```

---

## License

MIT © Vishnu Bharath
