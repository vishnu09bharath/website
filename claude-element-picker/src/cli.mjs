#!/usr/bin/env node
// claude-element-picker CLI — one-command MCP registration for various clients.
//
//   node claude-element-picker/src/cli.mjs config <client>
//
// Supported clients: claude, cursor, vscode, windsurf.
// Run from your project root. Merges into existing config (never clobbers other
// servers). The picker server itself is `src/server.mjs` (run by the client).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverAbs = path.join(__dirname, "server.mjs");
const cwd = process.cwd();
// Prefer a repo-relative command (portable across machines); fall back to abs.
const serverRel = path.relative(cwd, serverAbs);
const command = "node";
const args = [serverRel.startsWith("..") ? serverAbs : serverRel];

const [, , cmd, client] = process.argv;

if (cmd !== "config" || !client) {
  console.log("Usage: claude-element-picker config <claude|cursor|vscode|windsurf>");
  process.exit(cmd ? 1 : 0);
}

// Each target: where the config file lives + how an entry is shaped.
const TARGETS = {
  claude: { file: path.join(cwd, ".mcp.json"), key: "mcpServers", type: true },
  cursor: { file: path.join(cwd, ".cursor", "mcp.json"), key: "mcpServers", type: true },
  vscode: { file: path.join(cwd, ".vscode", "mcp.json"), key: "servers", type: true },
  windsurf: {
    file: path.join(os.homedir(), ".codeium", "windsurf", "mcp_config.json"),
    key: "mcpServers",
    type: false,
  },
};

const t = TARGETS[client];
if (!t) {
  console.error("Unknown client: " + client + " (try claude, cursor, vscode, windsurf)");
  process.exit(1);
}

let config = {};
if (fs.existsSync(t.file)) {
  try {
    config = JSON.parse(fs.readFileSync(t.file, "utf8")) || {};
  } catch (e) {
    console.error("Could not parse existing " + t.file + ": " + e.message);
    process.exit(1);
  }
}

config[t.key] = config[t.key] || {};
config[t.key].picker = {
  ...(t.type ? { type: "stdio" } : {}),
  command,
  args,
  env: {},
};

fs.mkdirSync(path.dirname(t.file), { recursive: true });
fs.writeFileSync(t.file, JSON.stringify(config, null, 2) + "\n");

console.log("✓ Registered picker MCP server for " + client);
console.log("  " + t.file);
console.log("  → " + command + " " + args.join(" "));
console.log("\nReload " + client + " and approve the server when prompted.");
