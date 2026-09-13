# vishnubharath.com

Personal portfolio. [Astro](https://astro.build) site with a small KV-backed admin,
deployed as a Cloudflare Worker. Uses [pnpm](https://pnpm.io) (version pinned in
`package.json` → `packageManager`).

## Develop

```sh
pnpm install
pnpm dev         # http://localhost:4321
pnpm test        # unit tests
pnpm build       # outputs to dist/
pnpm preview     # run the built Worker locally with wrangler
```

## Deploy (Cloudflare Workers Builds)

The `website` Worker is connected to this repo; every push to `main` deploys.

- **Build command:** `pnpm run build`
- **Deploy command:** `pnpm exec wrangler deploy`

Bindings, cron, and vars live in `wrangler.jsonc`; secrets and admin setup are
in [ADMIN.md](ADMIN.md).
