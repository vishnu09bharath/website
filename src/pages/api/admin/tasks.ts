import type { APIRoute } from "astro";
import { getAdmin } from "../../../lib/auth";
import { runTask, setTaskPaused } from "../../../lib/tasks";
import { TASKS } from "../../../tasks";

export const prerender = false;

// /admin task actions: run a task now, or pause/resume its schedule. Forms send
// `return=overview` to land back on the Overview tab instead of Tasks.
export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = (locals as any).runtime?.env ?? {};
  const login = await getAdmin(cookies, env);
  if (!login) return new Response("Unauthorized", { status: 401 });

  const f = await request.formData();
  const tab = f.get("return") === "overview" ? "overview" : "tasks";
  const back = (msg: string, ok: boolean) =>
    redirect(
      `/admin?task=${ok ? "ok" : "err"}&tab=${tab}&msg=${encodeURIComponent(msg.slice(0, 300))}#${tab}`,
    );

  const task = TASKS.find((t) => t.id === f.get("id"));
  if (!task) return back("Unknown task", false);

  switch (f.get("action")) {
    case "run": {
      const run = await runTask(env, task, "manual");
      return back(`${task.title}: ${run.message}`, run.ok);
    }
    case "pause":
    case "resume": {
      const paused = f.get("action") === "pause";
      await setTaskPaused(env, task.id, paused);
      return back(`${task.title} ${paused ? "paused" : "resumed"}`, true);
    }
    default:
      return back("Unknown action", false);
  }
};
