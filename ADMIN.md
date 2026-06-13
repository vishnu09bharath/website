# Site content admin (`/admin`)

A small custom CMS built into the site. The **banner** and the globe **travel
plan** are stored in a Cloudflare **KV** namespace and read at request time, so
edits go **live instantly — no rebuild and no git push**. `src/data/site.json`
is only the seed/fallback used before the first edit.

- Panel: **`/admin`**
- Storage: KV binding `SITE_KV`, key `site` (validated by the zod schema in
  `src/data/site.ts` on every read and write)
- Auth: Google OAuth, restricted to `mr.vishnubharath@gmail.com`

## Local editing (no login)

```sh
npm run dev
```

Open **http://localhost:4321/admin** — in dev the panel is open (no OAuth needed)
and writes to a local emulated KV. The home/about pages read it immediately.

## Production setup (one time)

Two things, both needing your accounts (I can't do these for you):

### 1. Create the KV namespace and bind it

```sh
npx wrangler kv namespace create SITE_KV
```

Paste the returned `id` into `wrangler.jsonc` (replacing `REPLACE_WITH_KV_NAMESPACE_ID`).
On Cloudflare Pages you can instead add the binding under **Settings → Functions →
KV namespace bindings** (variable name `SITE_KV`).

### 2. Create a Google OAuth client + set secrets

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

Copy the client ID + secret, then set these as **Cloudflare Pages environment
variables / secrets** (Production):

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from the OAuth client |
| `GOOGLE_CLIENT_SECRET` | from the OAuth client |
| `AUTH_SECRET` | random string — `openssl rand -hex 32` |
| `ALLOWED_EMAIL` | `mr.vishnubharath@gmail.com` |

Redeploy. Now `https://vishnubharath.com/admin` redirects to Google sign-in, and
only the verified `ALLOWED_EMAIL` account is allowed in. The client only requests
`openid email`.

> Note: this CMS edits live content in KV. `src/data/site.json` in the repo stays
> as the seed/default; it is not updated by admin edits.
