import { z } from "astro:content";
import { TASKS } from "../tasks";
import type { Task, TaskEnv } from "../tasks/types";
import { sendEmail } from "./email";

// Scheduled-task runner. The Worker's scheduled() handler calls runDueTasks()
// on every cron tick; /admin reads getTaskOverview() and can runTask() manually.
// Each task's state lives in SITE_KV under `task:<id>`; the last tick time under
// `tasks:heartbeat` (so /admin can tell when the cron itself stops firing).

const MINUTE = 60_000;
/** A run started this long ago without finishing was killed (Workers stop crons at 15 min). */
export const STALE_RUN = 15 * MINUTE;
/** Email at most one failure alert per task per day. */
export const ALERT_EVERY = 24 * 60 * MINUTE;
const HISTORY = 10;
const K_HEARTBEAT = "tasks:heartbeat";
const taskKey = (id: string) => `task:${id}`;

const runSchema = z.object({
  at: z.number(),
  ok: z.boolean(),
  ms: z.number(),
  message: z.string(),
  trigger: z.enum(["cron", "manual"]),
});
export type TaskRun = z.infer<typeof runSchema>;

const stateSchema = z.object({
  paused: z.boolean().default(false),
  /** Set while a run is in flight; 0 otherwise. */
  startedAt: z.number().default(0),
  /** One-off tasks: when a scheduled (not manual) run succeeded. */
  completedAt: z.number().default(0),
  lastAlertAt: z.number().default(0),
  /** Newest first. */
  history: z.array(runSchema).default([]),
});
export type TaskState = z.infer<typeof stateSchema>;

// ---------------------------------------------------------------- KV

export async function getTaskState(env: TaskEnv, id: string): Promise<TaskState> {
  try {
    const raw = await env?.SITE_KV?.get(taskKey(id));
    if (raw) return stateSchema.parse(JSON.parse(raw));
  } catch {
    // Unreadable state → start fresh rather than wedge the task.
  }
  return stateSchema.parse({});
}

async function putTaskState(env: TaskEnv, id: string, state: TaskState): Promise<void> {
  await env?.SITE_KV?.put(taskKey(id), JSON.stringify(state));
}

// ---------------------------------------------------------------- schedule

export function isDue(task: Pick<Task, "schedule">, state: TaskState, now: number): boolean {
  if (state.paused) return false;
  if (state.startedAt && now - state.startedAt < STALE_RUN) return false;
  if ("once" in task.schedule) {
    return !state.completedAt && now >= Date.parse(task.schedule.once);
  }
  const every = task.schedule.every * MINUTE;
  const last = state.history[0]?.at;
  // Cron ticks jitter by seconds, so allow some slack: a 30-min task should run
  // on every other 15-min tick, not slip to every third.
  return last === undefined || now - last >= every - Math.min(5 * MINUTE, every / 2);
}

/** When the task will next run: a timestamp, 0 for "next tick", or null for never. */
export function nextRunAt(task: Task, state: TaskState): number | null {
  if (state.paused) return null;
  if ("once" in task.schedule) {
    return state.completedAt ? null : Date.parse(task.schedule.once);
  }
  const last = state.history[0]?.at;
  return last === undefined ? 0 : last + task.schedule.every * MINUTE;
}

// ---------------------------------------------------------------- running

async function finish(env: TaskEnv, task: Task, state: TaskState, run: TaskRun): Promise<TaskState> {
  const next: TaskState = {
    ...state,
    startedAt: 0,
    completedAt:
      run.ok && run.trigger === "cron" && "once" in task.schedule ? run.at : state.completedAt,
    history: [run, ...state.history].slice(0, HISTORY),
  };

  if (!run.ok && run.trigger === "cron" && run.at - state.lastAlertAt >= ALERT_EVERY) {
    try {
      await sendEmail(env, {
        subject: `Scheduled task failed: ${task.title}`,
        text: [
          `"${task.title}" (${task.id}) failed at ${new Date(run.at).toISOString()}:`,
          "",
          run.message,
          "",
          "Details and run history: https://vishnubharath.com/admin#tasks",
          "(At most one alert per task per day.)",
        ].join("\n"),
      });
      next.lastAlertAt = run.at;
    } catch (e) {
      // No way to alert (e.g. RESEND_API_KEY unset) — the failure still shows in /admin.
      console.error(`Failure alert for ${task.id} not sent:`, e);
    }
  }

  await putTaskState(env, task.id, next);
  return next;
}

export async function runTask(env: TaskEnv, task: Task, trigger: TaskRun["trigger"]): Promise<TaskRun> {
  const at = Date.now();
  await putTaskState(env, task.id, { ...(await getTaskState(env, task.id)), startedAt: at });

  let ok = true;
  let message: string;
  try {
    message = (await task.run(env)) || "Done";
  } catch (e) {
    ok = false;
    message = e instanceof Error ? e.message : String(e);
  }

  // Re-read so a pause toggled mid-run isn't overwritten.
  const state = await getTaskState(env, task.id);
  const run = { at, ok, ms: Date.now() - at, message: message.slice(0, 500), trigger };
  return (await finish(env, task, state, run)).history[0];
}

/** Cron entrypoint: run every task that's due, one at a time. */
export async function runDueTasks(
  env: TaskEnv,
  tasks: Task[] = TASKS,
  now = Date.now(),
): Promise<Record<string, TaskRun>> {
  await env?.SITE_KV?.put(K_HEARTBEAT, String(now));

  // One-off tasks (reminders) are cheap; run them before recurring work so a
  // heavy task hitting the CPU limit can't starve them.
  const ordered = [...tasks].sort(
    (a, b) => Number("every" in a.schedule) - Number("every" in b.schedule),
  );

  const runs: Record<string, TaskRun> = {};
  for (const task of ordered) {
    let state = await getTaskState(env, task.id);
    if (state.startedAt && now - state.startedAt >= STALE_RUN) {
      state = await finish(env, task, state, {
        at: state.startedAt,
        ok: false,
        ms: now - state.startedAt,
        message: "Didn't finish — the Worker was stopped mid-run (likely a CPU or time limit).",
        trigger: "cron",
      });
    }
    if (isDue(task, state, now)) runs[task.id] = await runTask(env, task, "cron");
  }
  return runs;
}

// ---------------------------------------------------------------- admin

export async function setTaskPaused(env: TaskEnv, id: string, paused: boolean): Promise<void> {
  await putTaskState(env, id, { ...(await getTaskState(env, id)), paused });
}

export async function getTaskOverview(env: TaskEnv, tasks: Task[] = TASKS) {
  const [heartbeat, states] = await Promise.all([
    Promise.resolve(env?.SITE_KV?.get(K_HEARTBEAT)).catch(() => null),
    Promise.all(tasks.map((t) => getTaskState(env, t.id))),
  ]);
  return {
    /** Last cron tick, 0 if the scheduler has never run. */
    heartbeatAt: Number(heartbeat) || 0,
    tasks: tasks.map((task, i) => ({ task, state: states[i], nextRunAt: nextRunAt(task, states[i]) })),
  };
}
