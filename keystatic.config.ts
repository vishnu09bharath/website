import { config, fields, singleton } from "@keystatic/core";

// Keystatic CMS — admin panel served at /keystatic.
//
// In local dev (`npm run dev`) it runs in "local" mode: no login, edits write
// straight to src/data/site.json on disk. In production it runs in "github"
// mode: you sign in with GitHub and edits are committed to the repo, which
// triggers a Cloudflare Pages rebuild. The data here is the SAME src/data/site.json
// consumed (and validated by zod) in src/data/site.ts, so a bad edit still
// fails the build rather than shipping broken content.
//
// Production login requires a one-time GitHub App + a few env vars — see ADMIN.md.

export default config({
  storage: import.meta.env.DEV
    ? { kind: "local" }
    : { kind: "github", repo: { owner: "vishnu09bharath", name: "website" } },

  ui: {
    brand: { name: "Vishnu Bharath" },
  },

  singletons: {
    site: singleton({
      label: "Site content",
      path: "src/data/site", // no trailing slash → writes src/data/site.json
      format: { data: "json" },
      schema: {
        banner: fields.object(
          {
            enabled: fields.checkbox({
              label: "Show banner",
              defaultValue: true,
            }),
            prefix: fields.text({
              label: "Prefix",
              description:
                "Small lead-in shown before the main text (hidden on narrow screens). Include a trailing space.",
            }),
            text: fields.text({
              label: "Text",
              validation: { length: { min: 1 } },
            }),
            linkLabel: fields.text({
              label: "Link label",
              validation: { length: { min: 1 } },
            }),
            linkHref: fields.url({
              label: "Link URL",
              validation: { isRequired: true },
            }),
          },
          { label: "Announcement banner" },
        ),
        travel: fields.object(
          {
            home: fields.object(
              {
                label: fields.text({
                  label: "Label",
                  validation: { length: { min: 1 } },
                }),
                lat: fields.number({
                  label: "Latitude",
                  validation: { min: -90, max: 90 },
                }),
                lon: fields.number({
                  label: "Longitude",
                  validation: { min: -180, max: 180 },
                }),
                timezone: fields.text({
                  label: "Time zone (IANA)",
                  description: "e.g. America/New_York",
                  validation: { length: { min: 1 } },
                }),
              },
              { label: "Home" },
            ),
            destination: fields.object(
              {
                label: fields.text({
                  label: "Label",
                  validation: { length: { min: 1 } },
                }),
                lat: fields.number({
                  label: "Latitude",
                  validation: { min: -90, max: 90 },
                }),
                lon: fields.number({
                  label: "Longitude",
                  validation: { min: -180, max: 180 },
                }),
              },
              { label: "Destination" },
            ),
            arrival: fields.date({
              label: "Arrival date",
              description: "The globe counts down to this date.",
              validation: { isRequired: true },
            }),
          },
          { label: "Travel plan" },
        ),
      },
    }),
  },
});
