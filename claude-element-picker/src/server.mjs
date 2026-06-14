#!/usr/bin/env node
// Element-picker MCP server (zero deps).
//
// Two faces:
//   1. HTTP  (127.0.0.1:7337) — the browser picker (client.js) POSTs the
//      element(s) the user clicked in the dev preview here, and fetches the
//      client script itself from /picker.js.
//   2. stdio (JSON-RPC / MCP) — Claude Code connects here and pulls the
//      current selection via the `get_selected_elements` tool.
//
// The dev server and Claude never talk to each other; the browser is the wire.
// Launched by Claude Code via `.mcp.json` (see README.md). Port: $PICKER_PORT
// (default 7337).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PICKER_PORT) || 7337;
const REPO_ROOT = process.cwd();
const MAX = 20;

/** @type {Array<Record<string, any>>} */
let selections = [];
/** screenshots keyed by selection key: { mime, data(base64) } */
let shots = {};

const log = (...a) => process.stderr.write("[picker] " + a.join(" ") + "\n");

// ---------------------------------------------------------------- HTTP face --
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const httpServer = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/picker.js") {
    // Read from disk per-request so edits hot-reload on next page refresh.
    return fs.readFile(path.join(__dirname, "client.js"), (err, buf) => {
      if (err) return res.writeHead(500).end("// picker client missing");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(buf);
    });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, count: selections.length, shots: Object.keys(shots).length }));
  }

  if (req.method === "POST" && url.pathname === "/selections") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 5_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        selections = Array.isArray(parsed.selections) ? parsed.selections.slice(0, MAX) : [];
        // Drop screenshots whose selection is gone.
        const live = new Set(selections.map((s) => s.key));
        for (const k of Object.keys(shots)) if (!live.has(k)) delete shots[k];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: selections.length }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  // Screenshots arrive on their own endpoint so the /selections sync stays light.
  if (req.method === "POST" && url.pathname === "/shot") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 30_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const { key, mime, data } = JSON.parse(body || "{}");
        if (key && data) shots[key] = { mime: mime || "image/png", data };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  res.writeHead(404).end("not found");
});

httpServer.on("error", (e) => log("http error:", e.code || e.message));
httpServer.listen(PORT, "127.0.0.1", () => log("http listening on http://127.0.0.1:" + PORT));

// ------------------------------------------------------------------- helpers --
function rel(p) {
  if (!p) return p;
  return p.startsWith(REPO_ROOT) ? path.relative(REPO_ROOT, p) : p;
}

// Frame the source file semantically: component vs page vs plain file.
function describeSource(file) {
  if (!file) return null;
  const r = rel(file);
  const base = r.split("/").pop().replace(/\.[^.]+$/, "");
  let kind = "file";
  if (/\/components?\//.test(r) || /\/(islands|widgets)\//.test(r)) kind = "component";
  else if (/\/(pages|routes|app)\//.test(r)) kind = "page";
  else if (/\/layouts?\//.test(r)) kind = "layout";
  return `${kind} "${base}"`;
}

function render(opts) {
  const cssLevel = opts && opts.cssLevel != null ? opts.cssLevel : 1;
  const textDetail = opts && opts.textDetail != null ? opts.textDetail : 1;
  const includeHtml = !opts || opts.includeHtml !== false;

  if (!selections.length) {
    return "No elements are currently selected in the dev preview. Ask the user to open the site in their browser, toggle the picker, and click an element.";
  }
  const blocks = selections.map((s, i) => {
    const where = rel(s.file) + (s.loc ? ":" + s.loc : "");
    const tag =
      "<" +
      (s.tag || "?") +
      (s.id ? "#" + s.id : "") +
      (s.classes && s.classes.length ? "." + s.classes.join(".") : "") +
      ">";

    let text = null;
    if (textDetail >= 1 && s.text) text = textDetail >= 2 ? s.text : s.text.slice(0, 200);

    let styles = null;
    if (cssLevel === 1 && s.styles) styles = s.styles;
    else if (cssLevel >= 2 && (s.stylesFull || s.styles)) styles = s.stylesFull || s.styles;

    return [
      `[${i + 1}] ${where}`,
      describeSource(s.file) ? `    source: ${describeSource(s.file)}` : null,
      `    element: ${tag}`,
      text ? `    text: ${JSON.stringify(text)}` : null,
      s.note ? `    note: ${s.note}` : null,
      s.route ? `    route: ${s.route}` : null,
      shots[s.key] ? `    screenshot: attached below` : null,
      styles ? `    computed styles: ${JSON.stringify(styles)}` : null,
      includeHtml && s.html ? `    html: ${s.html}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return `${selections.length} element(s) selected in the dev preview:\n\n` + blocks.join("\n\n");
}

// Build the MCP content array: the text block, then any screenshots as images.
function selectionContent(opts) {
  const content = [{ type: "text", text: render(opts) }];
  selections.forEach((s, i) => {
    const shot = shots[s.key];
    if (!shot) return;
    content.push({ type: "text", text: `screenshot of [${i + 1}] ${rel(s.file)}:` });
    content.push({ type: "image", data: shot.data, mimeType: shot.mime });
  });
  return content;
}

// -------------------------------------------------------------- MCP / stdio --
const TOOLS = [
  {
    name: "get_selected_elements",
    description:
      "Return the element(s) the user has currently selected in the browser dev preview using the visual picker. Each includes its source file and line (from data-astro-source), the kind of source (component/page/layout), tag, id, classes, visible text, computed styles, outerHTML, any note the user attached, and any screenshot the user captured (returned as an image). Call this whenever the user refers to 'the selected element', 'the element I picked', 'this thing', etc. Use the detail params to control payload size: start with defaults, raise cssLevel/textDetail only if you need more.",
    inputSchema: {
      type: "object",
      properties: {
        cssLevel: {
          type: "number",
          enum: [0, 1, 2],
          description: "Computed styles detail: 0=none, 1=key layout/typography (default), 2=full computed styles.",
        },
        textDetail: {
          type: "number",
          enum: [0, 1, 2],
          description: "Text detail: 0=none, 1=truncated visible text (default), 2=full visible text.",
        },
        includeHtml: {
          type: "boolean",
          description: "Include element outerHTML (default true).",
        },
      },
    },
  },
  {
    name: "clear_selected_elements",
    description: "Clear the current picker selection once you have finished acting on it.",
    inputSchema: { type: "object", properties: {} },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: (params && params.protocolVersion) || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "picker", version: "1.0.0" },
      });
    case "notifications/initialized":
      return; // notification — no response
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = params && params.name;
      if (name === "get_selected_elements") {
        const content = selectionContent(params && params.arguments);
        // Screenshots are one-shot: once delivered to the agent, drop them so
        // they aren't re-sent (and re-billed) on later calls. The lightweight
        // selection context (file/line/styles/note) stays put.
        shots = {};
        return ok(id, { content });
      }
      if (name === "clear_selected_elements") {
        selections = [];
        shots = {};
        return ok(id, { content: [{ type: "text", text: "Selection cleared." }] });
      }
      return fail(id, -32602, "Unknown tool: " + name);
    }
    default:
      if (id !== undefined) fail(id, -32601, "Method not found: " + method);
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log("bad json line:", line.slice(0, 120));
      continue;
    }
    try {
      handle(msg);
    } catch (e) {
      log("handle error:", e.message);
    }
  }
});
process.stdin.on("end", () => process.exit(0));

log("picker MCP server ready (repo root: " + REPO_ROOT + ")");
