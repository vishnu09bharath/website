# Project instructions for Claude

Minimalist Astro 5 portfolio deployed on Cloudflare. Custom KV-backed CMS
(`/log-in` → `/admin`, Google OAuth). Keep deps pinned and the build minimal.

## Running the dev server across worktrees

This repo is developed in several git worktrees under `.claude/worktrees/`. The
committed `.claude/launch.json` pins port **4399**, which is fine for the main
checkout but means every worktree would fight over the same port. So:

- **Each worktree must use its own localhost port.** Derive it deterministically
  from the worktree directory name so the same worktree always lands on the same
  port across restarts:

  ```sh
  WT=$(basename "$PWD")
  PORT=$([ "$WT" = "website" ] && echo 4399 || echo $((4400 + $(echo -n "$WT" | cksum | cut -d' ' -f1) % 90)))
  npm run dev -- --port "$PORT"
  ```

  (Main checkout → 4399; each worktree → a stable port in 4400–4489.)

- **Before starting a new dev server, count how many are already running:**

  ```sh
  ps aux | grep "astro dev" | grep -v grep | wc -l | tr -d ' '
  ```

- **If more than 4 dev servers are already running, do NOT start another one.**
  Instead:
  1. Validate changes with `npm run build` (it type-checks and catches most
     issues without a server). Only reach for `npm run preview` if a genuine
     runtime check is unavoidable.
  2. If a running server must be freed up, **ask me first** before killing any of
     the others — list which worktrees/ports are in use and let me pick. Never
     close another worktree's server without explicit approval.

- When you do start a server, tell me the port so I know which `localhost:<port>`
  belongs to this worktree.
