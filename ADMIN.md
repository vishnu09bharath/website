# Site content admin (`/admin`)

A small custom CMS built into the site. The **banner** and the globe **travel
plan** are stored in a Cloudflare **KV** namespace and read at request time, so
edits go **live instantly — no rebuild and no git push**. `src/data/site.json`
is only the seed/fallback used before the first edit.

- Panel: **`/admin`** (tabs: Overview, Site content, Tasks)
- Storage: KV binding `SITE_KV`, key `site` (validated by the zod schema in
  `src/data/site.ts` on every read and write)
- Auth: Google OAuth, restricted to `mr.vishnubharath@gmail.com`
- Hosting: a Cloudflare **Worker** (static assets + Astro SSR + cron), built from
  GitHub by Workers Builds

## Local editing (no login)

```sh
pnpm install
pnpm dev
```

Open **http://localhost:4321/admin** — in dev the panel is open (no OAuth needed)
and writes to a local emulated KV. The home/about pages read it immediately.

## Scheduled tasks

Recurring jobs and one-off reminders live in `src/tasks/`. The Worker cron
(`*/15 * * * *` in `wrangler.jsonc`) calls `runDueTasks()` in `src/lib/tasks.ts`,
which runs whatever is due, records each run in KV (`task:<id>`), and emails
`ALLOWED_EMAIL` (via Resend, from `website@vishnubharath.com`) when a scheduled
run fails — at most once per task per day.

**To add a task**, create `src/tasks/my-task.ts`:

```ts
import { sendEmail } from "../lib/email";
import type { Task } from "./types";

export default {
  id: "my-task",                      // KV key — don't rename once deployed
  title: "My task",
  description: "What it does, shown in /admin.",
  schedule: { every: 60 },            // minutes (≥ 15), or { once: "2027-01-01T14:00:00Z" }
  async run(env) {
    // env has SITE_KV and the Worker's secrets. Throw to mark the run failed.
    await sendEmail(env, { subject: "Hello", text: "From the scheduler" });
    return "Sent";                    // short summary shown in /admin
  },
} satisfies Task;
```

…then add it to `TASKS` in `src/tasks/index.ts`. `pnpm test` checks ids are
unique and schedules are valid.

Behaviour worth knowing:

- `every` tasks run on the first tick after their interval elapses.
- `once` tasks run on the first tick at/after their time and retry every tick
  until a **scheduled** run succeeds. **Run now** on a one-off is a test — it
  doesn't use up the scheduled run.
- The **Tasks** tab shows status, next run, the last 10 runs, **Run now** and
  **Pause/Resume**, plus when the cron last ticked (with a warning if it stops).
- A run the Worker kills mid-flight (CPU/time limit) is recorded as failed on the
  next tick. On the Workers **Free** plan a cron invocation gets only 10 ms of CPU,
  so heavy tasks like the news refresh need **Workers Paid**.

Local cron test: `pnpm build && pnpm exec wrangler dev --test-scheduled`, then
`curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"`.

## Overview tab

- **Health** (live): the deployed commit (baked in at build time from
  `WORKERS_CI_COMMIT_SHA`) and whether `main` is ahead of it, when the cron last
  ticked, failing tasks, and news feed freshness.
- **Traffic** and **Repo** come from the hourly `overview-stats` task, cached in
  KV (`overview:stats`); **Refresh stats** runs it on the spot. If a source fails,
  the card keeps its last good data and shows the error.
  - Repo: recent commits, open PRs, and the last résumé sync, from the public
    GitHub API. Cloudflare's shared egress IPs can hit GitHub's anonymous rate
    limit — if that happens, add a `GITHUB_TOKEN` secret (fine-grained, public
    repos read-only).
  - Traffic: Cloudflare **Web Analytics** (free, cookieless). To enable:
    1. Cloudflare → **Web Analytics → Add a site → `vishnubharath.com`**.
    2. Create an API token with **Account → Account Analytics → Read** and add
       it as the `CF_ANALYTICS_TOKEN` secret (uses `CF_ACCOUNT_ID` too).
    3. Put the site tag shown for the site into `vars.CF_WEB_ANALYTICS_SITE_TAG`
       in `wrangler.jsonc`.

## Production setup (one time)

These need your accounts (I can't do them for you).

### 1. KV namespace

Already created — its id is in `wrangler.jsonc`, and every deploy binds it as
`SITE_KV`. (To recreate: `pnpm exec wrangler kv namespace create SITE_KV`.)

### 2. Google OAuth client

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Create (or pick) a project.
2. **APIs & Services → OAuth consent screen:** User type **External**. Fill the
   required app name/support email. While it's in **Testing**, add
   `mr.vishnubharath@gmail.com` as a **Test user** (no Google verification needed
   for a single user).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.** Add **Authorized redirect URIs:**
   - `https://vishnubharath.com/api/auth/callback`
   - (optional, for local OAuth testing) `http://localhost:4321/api/auth/callback`

### 3. Worker secrets

Set these under **Workers & Pages → website → Settings → Variables and Secrets**,
all as type **Secret** (plain-text variables added in the dashboard get wiped by
the next `wrangler deploy`; secrets persist):

| Secret | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from the OAuth client |
| `GOOGLE_CLIENT_SECRET` | from the OAuth client |
| `AUTH_SECRET` | random string — `openssl rand -hex 32` |
| `ALLOWED_EMAIL` | `mr.vishnubharath@gmail.com` |
| `CF_ACCOUNT_ID` | Cloudflare account id (news ranking) |
| `CF_AI_TOKEN` | Workers AI API token (news ranking) |
| `RESEND_API_KEY` | Resend key, **Sending access** limited to `vishnubharath.com` |
| `CF_ANALYTICS_TOKEN` | API token with **Account Analytics: Read** (Overview traffic) |
| `GITHUB_TOKEN` | optional — only if the Overview hits GitHub rate limits |

Now `https://vishnubharath.com/admin` redirects to Google sign-in, and only the
verified `ALLOWED_EMAIL` account is allowed in. The client only requests
`openid email`.

## Moving from Pages to Workers (September 2026)

The site used to deploy as a Cloudflare **Pages** project. Pages never runs cron
triggers, so the scheduled news refresh silently never fired. Cutover checklist,
ordered to keep downtime to a minimum:

1. **Create the Worker from git.** Workers & Pages → Create → Import a
   repository → `vishnu09bharath/website`. Name it `website` (matching `name` in
   `wrangler.jsonc`). Build command `pnpm run build`, deploy command
   `pnpm exec wrangler deploy`, production branch `main`.
2. **Add the secrets** from the table above to the new Worker. Pages secrets
   can't be read back, so re-enter them from their sources (a good moment to
   rotate `CF_AI_TOKEN` and `AUTH_SECRET`; rotating `AUTH_SECRET` just logs you out).
3. **Redeploy** (Deployments → retry the latest build) so the secrets apply, then
   check the `*.workers.dev` URL serves the site. Google login only works on
   the real domain, so skip `/admin` there.
4. **Move the domains.** Worker → Settings → Domains & Routes → Add → Custom
   domain → `vishnubharath.com`, then `www.vishnubharath.com`. If Cloudflare
   says the hostname is already in use or has a DNS record, first remove it from
   the Pages project (Custom domains) — that deletes the Pages CNAME — and add it
   to the Worker right away.
5. **Verify** on `https://vishnubharath.com`: log in to `/admin` → **Tasks**. Within
   15 minutes "Scheduler last ran" appears and **Refresh news feed** shows OK.
   Press **Run now** on the résumé reminder to get a test email.
6. **Retire Pages.** Pages project → Settings → Builds → disable automatic
   deployments, and delete the project once you're happy.

> Note: this CMS edits live content in KV. `src/data/site.json` in the repo stays
> as the seed/default; it is not updated by admin edits.
