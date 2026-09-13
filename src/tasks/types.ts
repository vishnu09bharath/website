// Shared types for scheduled tasks. See ./index.ts for how to add one.

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

/** What a task can reach: the site's KV plus the Worker's secrets. */
export type TaskEnv =
  | {
      SITE_KV?: KV;
      RESEND_API_KEY?: string;
      ALLOWED_EMAIL?: string;
      CF_ACCOUNT_ID?: string;
      CF_AI_TOKEN?: string;
      CF_ANALYTICS_TOKEN?: string;
      CF_WEB_ANALYTICS_SITE_TAG?: string;
      GITHUB_TOKEN?: string;
    }
  | undefined;

export type Schedule =
  /** Repeat every N minutes. Resolution is the cron in wrangler.jsonc (15 min). */
  | { every: number }
  /** Run once at/after this ISO timestamp; retried each tick until it succeeds. */
  | { once: string };

export type Task = {
  /** Stable id — it's the KV key for run history, so don't rename once deployed. */
  id: string;
  title: string;
  description: string;
  schedule: Schedule;
  /** Return a short summary for /admin; throw to mark the run failed (emails an alert). */
  run(env: TaskEnv): Promise<string | void>;
};
