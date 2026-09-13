import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

// Bundle a TS module for Node, swapping Astro's virtual zod export for zod.
async function load(entry) {
  const { outputFiles } = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    alias: { "astro:content": "zod" },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
}

const overview = await load("src/lib/overview.ts");
const { default: overviewTask } = await load("src/tasks/overview-stats.ts");

const NOW = Date.parse("2026-09-13T18:00:00Z");
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function memoryKV() {
  const store = new Map();
  return {
    store,
    SITE_KV: {
      async get(k) { return store.get(k) ?? null; },
      async put(k, v) { store.set(k, v); },
    },
  };
}

const commit = (sha, message, date) => ({
  sha,
  html_url: `https://github.com/x/commit/${sha}`,
  commit: { message, committer: { date } },
});

/** Routes fetches by URL substring; records every request. */
function mockFetch(t, routes) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, respond] of routes) {
      if (String(url).includes(match)) return respond(init);
    }
    return json({ message: "not found" }, 404);
  });
  return calls;
}

const githubRoutes = [
  ["path=public/resume.pdf", () => json([commit("r1", "Update résumé", "2026-09-13T17:00:00Z")])],
  ["/commits?sha=main", () => json([
    commit("aaaaaaa1", "Merge pull request #18\n\nbody", "2026-09-13T18:35:26Z"),
    commit("bbbbbbb2", "Add tasks", "2026-09-13T18:20:00Z"),
  ])],
  ["/pulls?state=open", () => json([{ number: 19, title: "Overview", created_at: "2026-09-13T19:00:00Z", html_url: "https://github.com/x/pull/19" }])],
  ["/compare/", () => json({ ahead_by: 2 })],
];

test("GitHub stats: commits, open PRs, last résumé sync, and how far main is ahead of the live build", async (t) => {
  const calls = mockFetch(t, githubRoutes);
  const stats = await overview.fetchGitHub({ GITHUB_TOKEN: "ghp_x" }, "live123");

  assert.deepEqual(stats.commits.map((c) => [c.sha, c.message]), [
    ["aaaaaaa1", "Merge pull request #18"],
    ["bbbbbbb2", "Add tasks"],
  ]);
  assert.deepEqual(stats.pulls, [
    { number: 19, title: "Overview", at: Date.parse("2026-09-13T19:00:00Z"), url: "https://github.com/x/pull/19" },
  ]);
  assert.equal(stats.resumeSyncedAt, Date.parse("2026-09-13T17:00:00Z"));
  assert.equal(stats.liveBehindBy, 2);
  assert.ok(calls.some((c) => c.url.includes("/compare/live123...main")));
  for (const c of calls) {
    assert.ok(c.url.startsWith("https://api.github.com/repos/vishnu09bharath/website/"));
    assert.ok(c.init.headers["User-Agent"], "GitHub requires a User-Agent");
    assert.equal(c.init.headers.Authorization, "Bearer ghp_x");
  }
});

test("GitHub stats: unknown live commit is null, not an error; API failures throw", async (t) => {
  const calls = mockFetch(t, githubRoutes.filter(([m]) => m !== "/compare/"));
  assert.equal((await overview.fetchGitHub({}, "local-only")).liveBehindBy, null);
  assert.equal((await overview.fetchGitHub({}, "")).liveBehindBy, null);
  assert.equal(calls.filter((c) => c.url.includes("/compare/")).length, 1);
  assert.ok(!calls[0].init.headers.Authorization);

  t.mock.restoreAll();
  mockFetch(t, [["api.github.com", () => json({}, 403)]]);
  await assert.rejects(overview.fetchGitHub({}, ""), /GitHub 403.*GITHUB_TOKEN/);
});

test("traffic is null (and makes no request) until analytics is configured", async (t) => {
  const calls = mockFetch(t, []);
  assert.equal(await overview.fetchTraffic({ CF_ACCOUNT_ID: "acct", CF_ANALYTICS_TOKEN: "tok" }, NOW), null);
  assert.equal(calls.length, 0);
});

test("traffic: 7 zero-filled days, totals, and top lists without direct/internal referrers", async (t) => {
  const calls = mockFetch(t, [["api.cloudflare.com/client/v4/graphql", () => json({
    data: { viewer: { accounts: [{
      days: [
        { count: 10, sum: { visits: 4 }, dimensions: { date: "2026-09-08" } },
        { count: 5, sum: { visits: 3 }, dimensions: { date: "2026-09-13" } },
      ],
      pages: [{ count: 9, dimensions: { requestPath: "/" } }, { count: 4, dimensions: { requestPath: "/work/" } }],
      referrers: [
        { count: 8, dimensions: { refererHost: "" } },
        { count: 6, dimensions: { refererHost: "vishnubharath.com" } },
        { count: 3, dimensions: { refererHost: "www.linkedin.com" } },
      ],
      countries: [{ count: 12, dimensions: { countryName: "United States" } }],
    }] } },
  })]]);

  const env = { CF_ACCOUNT_ID: "acct", CF_ANALYTICS_TOKEN: "tok", CF_WEB_ANALYTICS_SITE_TAG: "site" };
  const traffic = await overview.fetchTraffic(env, NOW);

  assert.deepEqual(traffic.days.map((d) => d.date), [
    "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13",
  ]);
  assert.deepEqual(traffic.days.map((d) => d.views), [0, 10, 0, 0, 0, 0, 5]);
  assert.deepEqual([traffic.views, traffic.visits], [15, 7]);
  assert.deepEqual(traffic.pages, [{ label: "/", count: 9 }, { label: "/work/", count: 4 }]);
  assert.deepEqual(traffic.referrers, [{ label: "www.linkedin.com", count: 3 }]);
  assert.deepEqual(traffic.countries, [{ label: "United States", count: 12 }]);

  const { init } = calls[0];
  assert.equal(init.headers.Authorization, "Bearer tok");
  const { variables } = JSON.parse(init.body);
  assert.deepEqual(variables, { accountTag: "acct", siteTag: "site", start: "2026-09-07T00:00:00Z", end: "2026-09-13T18:00:00.000Z" });
});

test("traffic: GraphQL errors surface their message", async (t) => {
  mockFetch(t, [["graphql", () => json({ data: null, errors: [{ message: "not authorized for that account" }] })]]);
  const env = { CF_ACCOUNT_ID: "acct", CF_ANALYTICS_TOKEN: "tok", CF_WEB_ANALYTICS_SITE_TAG: "site" };
  await assert.rejects(overview.fetchTraffic(env, NOW), /Cloudflare analytics: not authorized/);
});

test("refresh caches stats in KV and keeps last good data when a source fails", async (t) => {
  const kv = memoryKV();
  mockFetch(t, githubRoutes);
  const first = await overview.refreshOverviewStats(kv, NOW);
  assert.equal(first.github.error, "");
  assert.equal(first.github.data.commits.length, 2);
  assert.deepEqual(first.traffic, { data: null, fetchedAt: 0, error: "", configured: false });
  assert.deepEqual(await overview.getOverviewStats(kv), first);

  t.mock.restoreAll();
  mockFetch(t, [["api.github.com", () => json({}, 500)]]);
  const second = await overview.refreshOverviewStats(kv, NOW + 3_600_000);
  assert.match(second.github.error, /GitHub 500/);
  assert.equal(second.github.fetchedAt, NOW);
  assert.equal(second.github.data.commits.length, 2);
});

test("overview-stats task fails loudly when a source errors", async (t) => {
  mockFetch(t, [["api.github.com", () => json({}, 500)]]);
  await assert.rejects(overviewTask.run(memoryKV()), /GitHub 500/);

  t.mock.restoreAll();
  mockFetch(t, githubRoutes);
  assert.equal(await overviewTask.run(memoryKV()), "GitHub updated (traffic not configured)");
});
