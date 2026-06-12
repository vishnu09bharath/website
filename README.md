# vishnubharath.com

Personal portfolio. Static site built with [Astro](https://astro.build) (Vite under the hood), deployed on Cloudflare Pages.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

## Deploy (Cloudflare Pages)

Connect the repo in the Cloudflare dashboard with:

- **Build command:** `npm run build`
- **Build output directory:** `dist`

No environment variables, adapters, or wrangler config required — the site is fully static.
