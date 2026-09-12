import assert from "node:assert/strict";
import { test } from "node:test";
import { build, transform } from "esbuild";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Bundle the library for Node, replacing Astro's virtual schema export with
// the same Zod dependency used by Astro.
const { outputFiles } = await build({
  entryPoints: ["src/lib/news.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  alias: { "astro:content": "zod" },
});

const page = await readFile("src/pages/news.astro", "utf8");
const { code: client } = await transform(page.match(/<script>([\s\S]*?)<\/script>/)[1], {
  loader: "ts",
});

async function runPage({ stale = true, recent = false, ok = true, articles = [{}] } = {}) {
  let requests = 0;
  let reloads = 0;
  const button = { disabled: false, textContent: "↻", addEventListener() {} };
  const status = { hidden: true, textContent: "" };
  runInNewContext(client, {
    document: {
      body: { dataset: { needsRefresh: String(stale) } },
      querySelector: () => button,
      getElementById: () => status,
      querySelectorAll: () => [],
    },
    sessionStorage: {
      getItem: () => recent ? String(Date.now()) : null,
      setItem() {},
    },
    AbortSignal,
    fetch: async () => { requests++; return { ok, json: async () => ({ articles }) }; },
    location: { reload() { reloads++; } },
  });
  await new Promise(setImmediate);
  return { requests, reloads, button, status };
}

test("stale and cold pages refresh after rendering", async () => {
  const result = await runPage();
  assert.equal(result.requests, 1);
  assert.equal(result.reloads, 1);
});

test("fresh and saved pages do not automatically refresh", async () => {
  assert.equal((await runPage({ stale: false })).requests, 0);
});

test("KV propagation delay cannot cause an immediate refresh loop", async () => {
  const result = await runPage({ recent: true });
  assert.equal(result.requests, 0);
  assert.equal(result.reloads, 0);
});

test("failed and empty refreshes keep the page usable without reloading", async () => {
  for (const options of [{ ok: false }, { articles: [] }]) {
    const result = await runPage(options);
    assert.equal(result.reloads, 0);
    assert.equal(result.button.disabled, false);
    assert.equal(result.status.hidden, false);
    assert.match(result.status.textContent, /Try|try/);
  }
});
const { getFeed } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

test("page feed reads never fetch sources, call AI, or write KV", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("Page rendering must not make an external request");
  });
  const article = {
    id: "story", source: "BBC News", title: "A story",
    url: "https://example.com/story", publishedAt: Date.now(),
    sourceLogo: "", image: "", description: "",
  };

  for (const age of [0, 31 * 60_000, 7 * 86_400_000]) {
    const cached = { builtAt: Date.now() - age, articles: [article] };
    const keys = [];
    const env = { SITE_KV: {
      async get(key) { keys.push(key); return JSON.stringify(cached); },
      async put() { assert.fail("Cache reads must not write"); },
    } };
    assert.deepEqual(await getFeed(env), cached);
    assert.deepEqual(keys, ["news:feed"]);
  }

  for (const raw of [null, "invalid JSON", '{"articles":"invalid"}']) {
    assert.deepEqual(await getFeed({ SITE_KV: {
      async get() { return raw; },
      async put() { assert.fail("Missing cache must not trigger a rebuild"); },
    } }), { builtAt: 0, articles: [] });
  }
  assert.deepEqual(await getFeed(undefined), { builtAt: 0, articles: [] });
  assert.deepEqual(await getFeed({ SITE_KV: {
    async get() { throw new Error("KV unavailable"); },
    async put() { assert.fail("Failed cache reads must not trigger a rebuild"); },
  } }), { builtAt: 0, articles: [] });
});
