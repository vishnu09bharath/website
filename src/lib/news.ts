// Core library for the private /news dashboard.
//
// Pipeline: fetch RSS from the outlets in ../data/feeds.ts → keep a rolling 72h
// "pool" of articles in KV → ask the Cloudflare Workers AI REST API to rank the
// most worth-reading stories (balancing fresh news with important unread
// "catch-up" stories) → cache the result as the rendered feed. Everything lives
// in the existing SITE_KV namespace; there is no database.
//
// Mirrors the conventions of ../data/site.ts: zod validates every KV read/write,
// and a bad/missing value falls back to a safe default rather than throwing.

import { z } from "astro:content";
import { XMLParser } from "fast-xml-parser";
import { FEEDS, type Feed } from "../data/feeds";

// ---------------------------------------------------------------- schemas

export const articleSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceLogo: z.string().default(""),
  title: z.string(),
  url: z.string(),
  image: z.string().default(""),
  description: z.string().default(""),
  publishedAt: z.number(),
});
export type Article = z.infer<typeof articleSchema>;

const poolArticleSchema = articleSchema.extend({
  firstFetched: z.number(),
  surfaced: z.boolean().default(false),
});
export type PoolArticle = z.infer<typeof poolArticleSchema>;

const poolSchema = z.object({ articles: z.array(poolArticleSchema).default([]) });
const feedSchema = z.object({
  builtAt: z.number().default(0),
  articles: z.array(articleSchema).default([]),
});
export type FeedCache = z.infer<typeof feedSchema>;
const savedSchema = z.object({ articles: z.array(articleSchema).default([]) });
const stateSchema = z.object({
  lastVisitAt: z.number().default(0),
  readIds: z.record(z.number()).default({}),
});
export type NewsState = z.infer<typeof stateSchema>;

// ---------------------------------------------------------------- env / KV

type KV = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};
export type NewsEnv =
  | { SITE_KV?: KV; CF_ACCOUNT_ID?: string; CF_AI_TOKEN?: string }
  | undefined;

const K_POOL = "news:pool";
const K_FEED = "news:feed";
const K_SAVED = "news:saved";
const K_STATE = "news:state";

const POOL_TTL = 72 * 3_600_000; // keep 72h of articles for catch-up
const READ_TTL = 7 * 86_400_000; // forget "read" marks after a week
const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const INTEREST =
  "The reader is an MIT Media Lab researcher and FRC robotics mentor. They care most about: AI and machine learning, robotics and hardware, scientific research and breakthroughs, the technology industry, and major world/US news. They care little about celebrity gossip or routine sports scores.";

async function readJSON<T>(
  env: NewsEnv,
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): Promise<T> {
  const kv = env?.SITE_KV;
  if (!kv) return fallback;
  try {
    const raw = await kv.get(key);
    if (!raw) return fallback;
    return schema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

async function writeJSON(env: NewsEnv, key: string, value: unknown): Promise<void> {
  if (!env?.SITE_KV) return;
  await env.SITE_KV.put(key, JSON.stringify(value));
}

// ---------------------------------------------------------------- helpers

function hashId(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function logoFor(feed: Feed): string {
  if (feed.logo) return feed.logo;
  try {
    const host = new URL(feed.home).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

function asText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return asText(v["#text"]);
  return "";
}

function safeCodePoint(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripHtml(s: string): string {
  let out = s.replace(/<[^>]*>/g, " ");
  // Decode twice: some feeds double-encode (e.g. "&amp;#8217;" → "&#8217;" → "’").
  out = decodeEntities(out);
  out = decodeEntities(out);
  return out.replace(/\s+/g, " ").trim();
}

function truncate(s: string, n = 220): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function firstImg(html: string): string {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

function pickImage(item: any): string {
  const mc = item["media:content"];
  const mcArr = Array.isArray(mc) ? mc : mc ? [mc] : [];
  for (const m of mcArr) {
    const url = m?.["@_url"];
    if (url && (!m["@_medium"] || m["@_medium"] === "image")) return url;
  }
  const mt = item["media:thumbnail"];
  const mtUrl = Array.isArray(mt) ? mt[0]?.["@_url"] : mt?.["@_url"];
  if (mtUrl) return mtUrl;
  const enc = item.enclosure;
  const encArr = Array.isArray(enc) ? enc : enc ? [enc] : [];
  for (const e of encArr) {
    const t = e?.["@_type"] || "";
    if (e?.["@_url"] && (!t || t.startsWith("image"))) return e["@_url"];
  }
  const body =
    asText(item["content:encoded"]) ||
    asText(item.description) ||
    asText(item.content) ||
    asText(item.summary);
  return firstImg(body);
}

function pickLink(item: any): string {
  const l = item.link;
  if (typeof l === "string") return l;
  if (Array.isArray(l)) {
    const alt =
      l.find((x: any) => x?.["@_rel"] === "alternate") ||
      l.find((x: any) => x?.["@_href"]);
    return alt?.["@_href"] || asText(alt) || "";
  }
  if (l && typeof l === "object") return l["@_href"] || asText(l);
  return asText(item.id) || asText(item.guid);
}

function pickDate(item: any): number {
  const raw =
    asText(item.pubDate) ||
    asText(item.published) ||
    asText(item.updated) ||
    asText(item["dc:date"]);
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

function stripPool(p: PoolArticle): Article {
  const { firstFetched, surfaced, ...a } = p;
  return a;
}

// ---------------------------------------------------------------- fetch RSS

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

async function fetchOne(feed: Feed): Promise<Article[]> {
  let xml: string;
  try {
    const res = await fetch(feed.rss, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; vishnubharath-news/1.0; +https://vishnubharath.com)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  let data: any;
  try {
    data = parser.parse(xml);
  } catch {
    return [];
  }

  const rss = data?.rss?.channel;
  const atom = data?.feed;
  const rdf = data?.["rdf:RDF"];
  let raw = rss?.item ?? atom?.entry ?? rdf?.item ?? [];
  if (!Array.isArray(raw)) raw = [raw];

  const out: Article[] = [];
  for (const it of raw.slice(0, 15)) {
    const url = pickLink(it).trim();
    let title = stripHtml(asText(it.title));
    if (!url || !title) continue;
    // Google News appends " - Publisher" to every title; its description is just
    // a list of related-source links, so drop it and show the headline alone.
    let description = "";
    if (feed.googleNews) {
      title = title.replace(/\s+-\s+[^-]+$/, "").trim();
    } else {
      description = truncate(
        stripHtml(
          asText(it.description) ||
            asText(it.summary) ||
            asText(it["content:encoded"]),
        ),
      );
    }
    out.push({
      id: hashId(url),
      source: feed.name,
      sourceLogo: logoFor(feed),
      title,
      url,
      image: pickImage(it),
      description,
      publishedAt: pickDate(it),
    });
  }
  return out;
}

/** Fetch every feed in parallel; failures are skipped, results deduped by id. */
export async function fetchSources(): Promise<Article[]> {
  const results = await Promise.allSettled(FEEDS.map(fetchOne));
  const all: Article[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const a of r.value) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      all.push(a);
    }
  }
  return all;
}

// ---------------------------------------------------------------- pool

/** Merge fresh articles into the rolling 72h pool; return the live pool. */
export async function updatePool(
  env: NewsEnv,
  fresh: Article[],
): Promise<PoolArticle[]> {
  const now = Date.now();
  const existing = await readJSON(env, K_POOL, poolSchema, { articles: [] });
  const byId = new Map<string, PoolArticle>();
  for (const p of existing.articles) byId.set(p.id, p);
  for (const a of fresh) {
    const prev = byId.get(a.id);
    byId.set(a.id, {
      ...a,
      firstFetched: prev?.firstFetched ?? now,
      surfaced: prev?.surfaced ?? false,
    });
  }
  // The FEEDS whitelist is authoritative: drop pooled articles from any source
  // no longer listed (so editing feeds.ts takes effect on the next rebuild,
  // instead of lingering for 72h), and prune anything past the TTL.
  const allowed = new Set(FEEDS.map((f) => f.name));
  const merged = [...byId.values()].filter(
    (p) => allowed.has(p.source) && now - p.firstFetched < POOL_TTL,
  );
  await writeJSON(env, K_POOL, { articles: merged });
  return merged;
}

// ---------------------------------------------------------------- ranking

function parseIdArray(text: string): string[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Keep the feed diverse: take items in their ranked order but allow at most
 * `perSource` from any one outlet until the limit is hit, then backfill with the
 * overflow. Prevents one chatty feed (e.g. WSJ) from dominating the dashboard.
 */
function capBySource(items: Article[], limit: number, perSource = 4): Article[] {
  const counts = new Map<string, number>();
  const out: Article[] = [];
  const overflow: Article[] = [];
  for (const a of items) {
    const n = counts.get(a.source) ?? 0;
    if (n < perSource) {
      counts.set(a.source, n + 1);
      out.push(a);
    } else {
      overflow.push(a);
    }
    if (out.length >= limit) return out.slice(0, limit);
  }
  for (const a of overflow) {
    if (out.length >= limit) break;
    out.push(a);
  }
  return out.slice(0, limit);
}

/** Recency + unread fallback used when the AI API is unavailable or errors. */
function heuristicRank(
  candidates: PoolArticle[],
  state: NewsState,
  limit: number,
): Article[] {
  const now = Date.now();
  const ordered = [...candidates]
    .map((c) => {
      const ageH = (now - c.publishedAt) / 3_600_000;
      const recency = Math.max(0, 48 - ageH);
      const unread = state.readIds[c.id] ? 0 : 8;
      return { c, score: recency + unread };
    })
    .sort((a, b) => b.score - a.score)
    .map((s) => stripPool(s.c));
  return capBySource(ordered, limit);
}

/** Ask Workers AI (REST) to rank the pool; falls back to the heuristic. */
export async function rankWithAI(
  env: NewsEnv,
  candidates: PoolArticle[],
  state: NewsState,
  limit = 30,
): Promise<Article[]> {
  const acct = env?.CF_ACCOUNT_ID;
  const token = env?.CF_AI_TOKEN;
  if (!acct || !token || candidates.length === 0) {
    return heuristicRank(candidates, state, limit);
  }

  const now = Date.now();
  const hoursAway = state.lastVisitAt
    ? Math.round((now - state.lastVisitAt) / 3_600_000)
    : 999;
  const list = candidates.slice(0, 120).map((c) => ({
    id: c.id,
    source: c.source,
    title: c.title,
    ageH: Math.round((now - c.publishedAt) / 3_600_000),
    read: state.readIds[c.id] ? 1 : 0,
  }));

  const sys = `You curate a personal news dashboard. ${INTEREST}
Rank the most worth-reading stories. Balance fresh headlines with important "catch-up" stories the reader has not read yet (read=0), especially ones that give context to current events. The reader last opened the dashboard about ${hoursAway} hours ago — the longer that is, the more you should resurface important unread older stories instead of only the newest. Drop near-duplicate stories. Respond with ONLY a JSON array of the chosen "id" strings, best first, at most ${limit} items, and nothing else.`;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: JSON.stringify(list) },
          ],
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!res.ok) return heuristicRank(candidates, state, limit);
    const json: any = await res.json();
    // Response shape varies by model: `result.response` may already be a parsed
    // array, or a string; some models only fill the OpenAI-style choices[].
    const result = json?.result ?? {};
    const resp = result.response;
    const ids = Array.isArray(resp)
      ? resp.filter((x: unknown): x is string => typeof x === "string")
      : parseIdArray(asText(resp) || asText(result?.choices?.[0]?.message?.content));
    if (!ids.length) return heuristicRank(candidates, state, limit);

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const ordered: Article[] = [];
    const used = new Set<string>();
    for (const id of ids) {
      const c = byId.get(id);
      if (c && !used.has(id)) {
        used.add(id);
        ordered.push(stripPool(c));
      }
    }
    if (!ordered.length) return heuristicRank(candidates, state, limit);

    // Append the rest of the pool (recency-ordered) so the diversity cap can
    // backfill remaining slots with other outlets rather than more of the AI's
    // favourite — otherwise capping a WSJ-heavy AI list just re-adds WSJ.
    const remainder = candidates
      .filter((c) => !used.has(c.id))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map(stripPool);
    return capBySource([...ordered, ...remainder], limit);
  } catch {
    return heuristicRank(candidates, state, limit);
  }
}

// ---------------------------------------------------------------- feed

/** Force a full rebuild: fetch → pool → rank → cache. */
export async function buildFeed(env: NewsEnv): Promise<FeedCache> {
  const fresh = await fetchSources();
  const pool = await updatePool(env, fresh);
  const state = await getState(env);
  const ranked = await rankWithAI(env, pool, state, 30);
  const builtAt = Date.now();
  await writeJSON(env, K_FEED, { builtAt, articles: ranked });

  // Record which pool stories have now been surfaced (so catch-up can skip them).
  const surfaced = new Set(ranked.map((a) => a.id));
  if (surfaced.size) {
    const updated = pool.map((p) =>
      surfaced.has(p.id) ? { ...p, surfaced: true } : p,
    );
    await writeJSON(env, K_POOL, { articles: updated });
  }
  return { builtAt, articles: ranked };
}

/** Read only: page rendering must never wait for RSS downloads or AI ranking. */
export async function getFeed(env: NewsEnv): Promise<FeedCache> {
  return readJSON(env, K_FEED, feedSchema, {
    builtAt: 0,
    articles: [],
  });
}

/**
 * Important unread stories that predate the reader's last visit and are not in
 * the current feed — the "catch up" backlog.
 */
export async function getCatchUp(
  env: NewsEnv,
  feed: Article[],
  state: NewsState,
  limit = 6,
): Promise<Article[]> {
  const pool = await readJSON(env, K_POOL, poolSchema, { articles: [] });
  const now = Date.now();
  const inFeed = new Set(feed.map((a) => a.id));
  const cutoff = state.lastVisitAt || now - 24 * 3_600_000;
  return pool.articles
    .filter(
      (p) => !state.readIds[p.id] && !inFeed.has(p.id) && p.publishedAt < cutoff,
    )
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit)
    .map(stripPool);
}

// ---------------------------------------------------------------- state

export async function getState(env: NewsEnv): Promise<NewsState> {
  return readJSON(env, K_STATE, stateSchema, { lastVisitAt: 0, readIds: {} });
}

/** Record that the reader just opened the dashboard. */
export async function touchVisit(env: NewsEnv): Promise<void> {
  const s = await getState(env);
  await writeJSON(env, K_STATE, { ...s, lastVisitAt: Date.now() });
}

/** Mark a story as read (clicked through), pruning marks older than a week. */
export async function markRead(env: NewsEnv, id: string): Promise<void> {
  const s = await getState(env);
  s.readIds[id] = Date.now();
  const cutoff = Date.now() - READ_TTL;
  for (const k of Object.keys(s.readIds)) {
    if (s.readIds[k] < cutoff) delete s.readIds[k];
  }
  await writeJSON(env, K_STATE, s);
}

// ---------------------------------------------------------------- saved

export async function getSaved(env: NewsEnv): Promise<Article[]> {
  const s = await readJSON(env, K_SAVED, savedSchema, { articles: [] });
  return s.articles;
}

/** Toggle an article in the saved list; returns the new saved state. */
export async function toggleSaved(env: NewsEnv, article: Article): Promise<boolean> {
  const s = await readJSON(env, K_SAVED, savedSchema, { articles: [] });
  const idx = s.articles.findIndex((a) => a.id === article.id);
  if (idx >= 0) {
    s.articles.splice(idx, 1);
    await writeJSON(env, K_SAVED, s);
    return false;
  }
  s.articles.unshift(article);
  await writeJSON(env, K_SAVED, s);
  return true;
}
