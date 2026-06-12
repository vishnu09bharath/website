# Archive

Content removed from the live site but kept for later. Files here are **not**
built or routed by Astro (only `src/pages/` is). Their relative `import` paths
(e.g. `../../layouts/Base.astro`) assume their original location under
`src/pages/`, so restore them to that path to make them work again.

## Currently archived

| File | Original path | Section entry to restore |
| --- | --- | --- |
| `pages/work/school-store.astro` | `src/pages/work/school-store.astro` | "NEIA School Store" card in `src/pages/work/index.astro` |
| `pages/projects/day-of-ai.astro` | `src/pages/projects/day-of-ai.astro` | "MIT Day of AI — Gear Grease" card in `src/pages/projects/index.astro` |

## How to restore

1. Move the page back:

   ```sh
   git mv archive/pages/work/school-store.astro src/pages/work/school-store.astro
   # or
   git mv archive/pages/projects/day-of-ai.astro src/pages/projects/day-of-ai.astro
   ```

2. Re-add its entry to the relevant index page's array:

   - **School Store** → add to `sections` in `src/pages/work/index.astro`:

     ```js
     {
       href: "/work/school-store/",
       title: "NEIA School Store",
       time: "2023 – 2025",
       blurb: "CEO. Zero to $25K+ annual revenue at full profitability.",
     },
     ```

   - **Gear Grease** → restore the `projects` array + cards markup in
     `src/pages/projects/index.astro` (currently a `more soon...` placeholder):

     ```js
     {
       href: "/projects/day-of-ai/",
       title: "MIT Day of AI — Gear Grease",
       time: "2024",
       blurb: "LLM-driven game NPCs, presented at the Boston Museum of Science.",
     },
     ```
