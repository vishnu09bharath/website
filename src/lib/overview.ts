import type { TaskEnv } from "../tasks/types";
import { BUILD } from "./build-info";

// Data for the /admin Overview: GitHub repo activity + Cloudflare Web Analytics
// traffic. Fetched hourly by the overview-stats task and cached in KV, so the
// dashboard renders instantly. A section that fails keeps its last good data and
// records the error instead.

export const REPO = "vishnu09bharath/website";
const K_STATS = "overview:stats";
const DAY = 86_400_000;
const SITE_HOST = "vishnubharath.com";

export type Commit = { sha: string; message: string; at: number; url: string };
export type PullRequest = { number: number; title: string; at: number; url: string };
export type GitHubStats = {
  commits: Commit[];
  pulls: PullRequest[];
  /** Last commit touching public/resume.pdf (i.e. the last résumé sync). */
  resumeSyncedAt: number;
  /** Commits on main not in the live build; null if unknown. */
  liveBehindBy: number | null;
};

export type Ranked = { label: string; count: number };
export type TrafficStats = {
  /** Last 7 days, oldest first (UTC dates). */
  days: { date: string; views: number; visits: number }[];
  views: number;
  visits: number;
  pages: Ranked[];
  referrers: Ranked[];
  countries: Ranked[];
};

type Section<T> = { data: T | null; fetchedAt: number; error: string };
export type OverviewStats = {
  github: Section<GitHubStats>;
  traffic: Section<TrafficStats> & { configured: boolean };
};

const EMPTY: OverviewStats = {
  github: { data: null, fetchedAt: 0, error: "" },
  traffic: { data: null, fetchedAt: 0, error: "", configured: false },
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

// ---------------------------------------------------------------- GitHub

async function github<T>(env: TaskEnv, path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "vishnubharath.com-admin", // GitHub rejects requests without one
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env?.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 429 ? " (rate limited — set GITHUB_TOKEN)" : "";
    throw new Error(`GitHub ${res.status} for ${path.split("?")[0]}${hint}`);
  }
  return (await res.json()) as T;
}

export async function fetchGitHub(env: TaskEnv, liveSha = BUILD.sha): Promise<GitHubStats> {
  const [commits, pulls, resume, compare] = await Promise.all([
    github<any[]>(env, "/commits?sha=main&per_page=5"),
    github<any[]>(env, "/pulls?state=open&per_page=5"),
    github<any[]>(env, "/commits?sha=main&path=public/resume.pdf&per_page=1"),
    // A local or unpushed build has no comparable commit — that's "unknown", not an error.
    liveSha ? github<any>(env, `/compare/${liveSha}...main`).catch(() => null) : null,
  ]);
  const commitDate = (c: any) => Date.parse(c?.commit?.committer?.date ?? c?.commit?.author?.date ?? "") || 0;
  return {
    commits: commits.map((c) => ({
      sha: String(c.sha),
      message: String(c.commit?.message ?? "").split("\n")[0],
      at: commitDate(c),
      url: String(c.html_url),
    })),
    pulls: pulls.map((p) => ({
      number: Number(p.number),
      title: String(p.title),
      at: Date.parse(p.created_at) || 0,
      url: String(p.html_url),
    })),
    resumeSyncedAt: resume[0] ? commitDate(resume[0]) : 0,
    liveBehindBy: compare ? Number(compare.ahead_by) : null,
  };
}

// ---------------------------------------------------------------- traffic

// Cloudflare Web Analytics (RUM beacon) via the GraphQL Analytics API.
// count = page views, sum.visits = visits.
const TRAFFIC_QUERY = `query Overview($accountTag: string!, $siteTag: string!, $start: string!, $end: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      days: rumPageloadEventsAdaptiveGroups(limit: 14, filter: { siteTag: $siteTag, datetime_geq: $start, datetime_leq: $end }, orderBy: [date_ASC]) {
        count
        sum { visits }
        dimensions { date }
      }
      pages: rumPageloadEventsAdaptiveGroups(limit: 5, filter: { siteTag: $siteTag, datetime_geq: $start, datetime_leq: $end }, orderBy: [count_DESC]) {
        count
        dimensions { requestPath }
      }
      referrers: rumPageloadEventsAdaptiveGroups(limit: 8, filter: { siteTag: $siteTag, datetime_geq: $start, datetime_leq: $end }, orderBy: [count_DESC]) {
        count
        dimensions { refererHost }
      }
      countries: rumPageloadEventsAdaptiveGroups(limit: 5, filter: { siteTag: $siteTag, datetime_geq: $start, datetime_leq: $end }, orderBy: [count_DESC]) {
        count
        dimensions { countryName }
      }
    }
  }
}`;

function ranked(groups: any[] | undefined, key: string): Ranked[] {
  return (groups ?? [])
    .map((g) => ({ label: String(g?.dimensions?.[key] ?? ""), count: Number(g?.count) || 0 }))
    .filter((r) => r.label && !r.label.endsWith(SITE_HOST)) // drop direct + internal navigation
    .slice(0, 5);
}

/** Last 7 days of traffic, or null when analytics isn't configured. */
export async function fetchTraffic(env: TaskEnv, now = Date.now()): Promise<TrafficStats | null> {
  const token = env?.CF_ANALYTICS_TOKEN;
  const accountTag = env?.CF_ACCOUNT_ID;
  const siteTag = env?.CF_WEB_ANALYTICS_SITE_TAG;
  if (!token || !accountTag || !siteTag) return null;

  const dates = Array.from({ length: 7 }, (_, i) =>
    new Date(now - (6 - i) * DAY).toISOString().slice(0, 10),
  );
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: TRAFFIC_QUERY,
      variables: { accountTag, siteTag, start: `${dates[0]}T00:00:00Z`, end: new Date(now).toISOString() },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: any = await res.json().catch(() => null);
  if (!res.ok || body?.errors?.length || !body?.data) {
    throw new Error(`Cloudflare analytics: ${body?.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  }

  const account = body.data.viewer?.accounts?.[0] ?? {};
  const byDate = new Map<string, any>((account.days ?? []).map((g: any) => [g?.dimensions?.date, g]));
  const days = dates.map((date) => ({
    date,
    views: Number(byDate.get(date)?.count) || 0,
    visits: Number(byDate.get(date)?.sum?.visits) || 0,
  }));
  return {
    days,
    views: days.reduce((n, d) => n + d.views, 0),
    visits: days.reduce((n, d) => n + d.visits, 0),
    pages: ranked(account.pages, "requestPath"),
    referrers: ranked(account.referrers, "refererHost"),
    countries: ranked(account.countries, "countryName"),
  };
}

// ---------------------------------------------------------------- cache

export async function getOverviewStats(env: TaskEnv): Promise<OverviewStats> {
  try {
    const raw = await env?.SITE_KV?.get(K_STATS);
    if (raw) {
      const stored = JSON.parse(raw);
      return {
        github: { ...EMPTY.github, ...stored.github },
        traffic: { ...EMPTY.traffic, ...stored.traffic },
      };
    }
  } catch {
    // Unreadable cache → treat as empty; the next refresh rewrites it.
  }
  return structuredClone(EMPTY);
}

export async function refreshOverviewStats(env: TaskEnv, now = Date.now()): Promise<OverviewStats> {
  const prev = await getOverviewStats(env);
  const [gh, traffic] = await Promise.allSettled([fetchGitHub(env), fetchTraffic(env, now)]);

  const next: OverviewStats = {
    github:
      gh.status === "fulfilled"
        ? { data: gh.value, fetchedAt: now, error: "" }
        : { ...prev.github, error: errorMessage(gh.reason) },
    traffic:
      traffic.status === "rejected"
        ? { ...prev.traffic, configured: true, error: errorMessage(traffic.reason) }
        : traffic.value
          ? { data: traffic.value, fetchedAt: now, error: "", configured: true }
          : { ...EMPTY.traffic },
  };
  await env?.SITE_KV?.put(K_STATS, JSON.stringify(next));
  return next;
}
