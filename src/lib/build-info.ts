// Which commit this bundle was built from. astro.config.mjs injects __BUILD_INFO__
// at build time (Workers Builds' WORKERS_CI_COMMIT_SHA, else local git HEAD);
// it's absent in unit tests, so fall back to "unknown".

declare const __BUILD_INFO__: { sha: string; builtAt: number } | undefined;

export const BUILD: { sha: string; builtAt: number } =
  typeof __BUILD_INFO__ !== "undefined" ? __BUILD_INFO__ : { sha: "", builtAt: 0 };
