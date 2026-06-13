# Editing site content (CMS)

The landing-page **banner** and the globe's **travel plan** (home, destination,
time zone, arrival/countdown date) are edited through a Keystatic admin panel.
Everything is stored in [`src/data/site.json`](src/data/site.json) and validated
at build time by [`src/data/site.ts`](src/data/site.ts) — a bad value (e.g. a
malformed date or out-of-range coordinate) fails the build instead of shipping.

## Editing locally (no login)

```sh
npm run dev
```

Open **http://localhost:4321/keystatic** (or whatever port it prints). In local
dev there's no login — edits write straight to `src/data/site.json`. Commit and
push when happy; Cloudflare Pages redeploys (~1 min).

## Editing in production (GitHub login)

Live, the panel is at **https://vishnubharath.com/keystatic**. It signs you in
with GitHub and commits changes to this repo (which triggers a redeploy). This
needs a one-time GitHub App setup — only the repo owner can do this.

### 1. Create the GitHub App (easiest: the built-in wizard)

1. Deploy the site, then visit **https://vishnubharath.com/keystatic** while
   signed in to GitHub as the repo owner.
2. If the env vars below aren't set yet, Keystatic shows a **"set up GitHub"**
   button that creates the App for you with the correct callback URL and
   permissions. Approve it and **install it on the `vishnu09bharath/website`
   repo**. It will hand you the values for step 2.

<details>
<summary>Manual alternative</summary>

GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**:

- **Homepage URL:** `https://vishnubharath.com`
- **Callback URL:** `https://vishnubharath.com/api/keystatic/github/oauth/callback`
- **Request user authorization (OAuth) during installation:** on
- **Webhook → Active:** off
- **Permissions → Repository:** Contents = Read & write, Metadata = Read-only,
  Pull requests = Read & write
- **Where can this be installed:** Only this account

Create it, generate a **client secret**, note the **client ID** and the App
**slug** (from its URL), then **Install** it on the `website` repo.
</details>

### 2. Set environment variables (Cloudflare Pages → Settings → Variables, Production)

| Variable | Value |
| --- | --- |
| `KEYSTATIC_GITHUB_CLIENT_ID` | from the GitHub App |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | from the GitHub App |
| `KEYSTATIC_SECRET` | a random string — generate with `openssl rand -hex 32` |
| `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` | the GitHub App's slug |

Redeploy. Now `/keystatic` will require GitHub sign-in (and repo write access),
which is the access control for the CMS.

> For local dev you don't need any of these — local mode is unauthenticated and
> writes to disk. Storage mode switches automatically: `local` in dev,
> `github` in the production build (see [`keystatic.config.ts`](keystatic.config.ts)).
