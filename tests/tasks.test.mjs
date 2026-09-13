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

const tasks = await load("src/lib/tasks.ts");
const email = await load("src/lib/email.ts");
const { TASKS } = await load("src/tasks/index.ts");

const MIN = 60_000;
const EMPTY = { paused: false, startedAt: 0, completedAt: 0, lastAlertAt: 0, history: [] };
const ranAt = (at, extra = {}) => ({
  ...EMPTY,
  history: [{ at, ok: true, ms: 1, message: "", trigger: "cron" }],
  ...extra,
});

function memoryEnv(extra = {}) {
  const store = new Map();
  const env = {
    SITE_KV: {
      async get(k) { return store.get(k) ?? null; },
      async put(k, v) { store.set(k, v); },
    },
    RESEND_API_KEY: "re_test",
    ALLOWED_EMAIL: "me@example.com",
    ...extra,
  };
  return { env, store, read: (id) => JSON.parse(store.get(`task:${id}`)) };
}

function mockResend(t, status = 200) {
  const sent = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    return new Response(status === 200 ? JSON.stringify({ id: "email_1" }) : "forbidden", { status });
  });
  return sent;
}

const task = (id, schedule, run = async () => "ok") => ({ id, title: id, description: "", schedule, run });

test("recurring tasks run when never run, then wait out their interval", () => {
  const t = task("t", { every: 30 });
  const now = Date.now();
  assert.equal(tasks.isDue(t, EMPTY, now), true);
  assert.equal(tasks.isDue(t, ranAt(now - 15 * MIN), now), false);
  // Cron jitter: 29m50s since the last run still counts on the next 30-min tick.
  assert.equal(tasks.isDue(t, ranAt(now - 29 * MIN - 50_000), now), true);
  assert.equal(tasks.isDue(t, ranAt(now - 60 * MIN, { paused: true }), now), false);
  assert.equal(tasks.isDue(t, ranAt(now - 60 * MIN, { startedAt: now - MIN }), now), false);
});

test("one-off tasks wait for their date and stop after a scheduled success", () => {
  const t = task("r", { once: "2027-08-30T13:00:00Z" });
  const at = Date.parse("2027-08-30T13:00:00Z");
  assert.equal(tasks.isDue(t, EMPTY, at - MIN), false);
  assert.equal(tasks.isDue(t, EMPTY, at), true);
  assert.equal(tasks.isDue(t, { ...EMPTY, completedAt: at }, at + MIN), false);
});

test("cron runs due tasks (one-offs first), records results, and completes one-offs", async () => {
  const { env, store, read } = memoryEnv();
  const calls = [];
  const list = [
    task("every", { every: 30 }, async () => { calls.push("every"); return "3 stories"; }),
    task("once", { once: "2020-01-01T00:00:00Z" }, async () => { calls.push("once"); }),
    task("later", { once: "2999-01-01T00:00:00Z" }, async () => { calls.push("later"); }),
  ];
  const now = Date.now();
  await tasks.runDueTasks(env, list, now);
  assert.deepEqual(calls, ["once", "every"]);
  assert.equal(read("every").history[0].message, "3 stories");
  assert.equal(read("once").history[0].message, "Done");
  assert.ok(read("once").completedAt > 0);
  assert.equal(read("every").startedAt, 0);
  assert.equal(store.get("tasks:heartbeat"), String(now));

  await tasks.runDueTasks(env, list, now + MIN);
  assert.deepEqual(calls, ["once", "every"]);
});

test("manual runs of a one-off task don't use up its scheduled run", async () => {
  const { env, read } = memoryEnv();
  const t = task("r", { once: "2999-01-01T00:00:00Z" });
  assert.equal((await tasks.runTask(env, t, "manual")).ok, true);
  assert.equal(read("r").completedAt, 0);
  assert.equal(tasks.isDue(t, read("r"), Date.parse("2999-01-01T00:00:00Z")), true);
});

test("failed cron runs email an alert at most once a day; manual failures don't", async (t) => {
  const sent = mockResend(t);
  const { env, store, read } = memoryEnv();
  const boom = task("boom", { every: 15 }, async () => { throw new Error("feeds down"); });

  await tasks.runTask(env, boom, "cron");
  await tasks.runTask(env, boom, "cron");
  await tasks.runTask(env, boom, "manual");
  const state = read("boom");
  assert.equal(state.history.length, 3);
  assert.deepEqual([state.history[0].ok, state.history[0].message], [false, "feeds down"]);
  assert.equal(state.startedAt, 0);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.to, ["me@example.com"]);
  assert.match(sent[0].body.subject, /boom/);

  store.set("task:boom", JSON.stringify({ ...state, lastAlertAt: Date.now() - tasks.ALERT_EVERY }));
  await tasks.runTask(env, boom, "cron");
  assert.equal(sent.length, 2);
});

test("a run killed mid-flight is recorded as failed and alerted", async (t) => {
  const sent = mockResend(t);
  const { env, store, read } = memoryEnv();
  const now = Date.now();
  store.set("task:slow", JSON.stringify({ ...EMPTY, startedAt: now - tasks.STALE_RUN }));
  await tasks.runDueTasks(env, [task("slow", { every: 30 })], now);
  const state = read("slow");
  assert.equal(state.startedAt, 0);
  assert.equal(state.history[0].ok, false);
  assert.match(state.history[0].message, /stopped mid-run/);
  assert.equal(sent.length, 1);
});

test("a missing Resend key never breaks recording a failure", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("no key, no request"));
  t.mock.method(console, "error", () => {});
  const { env, read } = memoryEnv({ RESEND_API_KEY: undefined });
  const run = await tasks.runTask(env, task("x", { every: 15 }, async () => { throw new Error("x"); }), "cron");
  assert.equal(run.ok, false);
  assert.equal(read("x").lastAlertAt, 0);
});

test("sendEmail posts to Resend from website@vishnubharath.com", async (t) => {
  const sent = mockResend(t);
  const id = await email.sendEmail({ RESEND_API_KEY: "re_test", ALLOWED_EMAIL: "me@example.com" }, { subject: "Hi", text: "Body" });
  assert.equal(id, "email_1");
  assert.equal(sent[0].url, "https://api.resend.com/emails");
  assert.equal(sent[0].init.headers.Authorization, "Bearer re_test");
  assert.match(sent[0].body.from, /<website@vishnubharath\.com>$/);
  assert.deepEqual(sent[0].body.to, ["me@example.com"]);
  await assert.rejects(email.sendEmail({ ALLOWED_EMAIL: "x" }, { subject: "a", text: "b" }), /RESEND_API_KEY/);
});

test("sendEmail surfaces Resend errors", async (t) => {
  mockResend(t, 403);
  await assert.rejects(
    email.sendEmail({ RESEND_API_KEY: "k", ALLOWED_EMAIL: "x" }, { subject: "a", text: "b" }),
    /Resend 403/,
  );
});

test("registered tasks have unique ids and valid schedules", () => {
  assert.equal(new Set(TASKS.map((t) => t.id)).size, TASKS.length);
  for (const t of TASKS) {
    if ("every" in t.schedule) assert.ok(t.schedule.every >= 15, `${t.id}: every must be ≥ the 15-min cron`);
    else assert.ok(!Number.isNaN(Date.parse(t.schedule.once)), `${t.id}: bad once date`);
  }
  const reminder = TASKS.find((t) => t.id.startsWith("resume-token-reminder"));
  assert.ok(Date.parse(reminder.schedule.once) < Date.parse("2027-09-13T00:00:00Z"));
});
