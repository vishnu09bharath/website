// Scheduled tasks registry.
//
// To add a task: create a file in this folder that default-exports a Task (see
// types.ts), then add it to TASKS below. That's all — the Worker cron (every
// 15 min, wrangler.jsonc) runs whatever is due, records each run in KV, and
// emails ALLOWED_EMAIL when a scheduled run fails. Status, run history, "Run
// now" and pause/resume live on the /admin Tasks tab. Runner: src/lib/tasks.ts.

import type { Task } from "./types";
import newsRefresh from "./news-refresh";
import overviewStats from "./overview-stats";
import resumeTokenReminder from "./resume-token-reminder";

export const TASKS: Task[] = [newsRefresh, overviewStats, resumeTokenReminder];
