import { buildFeed } from "../lib/news";
import type { Task } from "./types";

export default {
  id: "news-refresh",
  title: "Refresh news feed",
  description: "Fetches the RSS sources, re-ranks with Workers AI, and caches the /news feed.",
  schedule: { every: 30 },
  async run(env) {
    const feed = await buildFeed(env);
    if (!feed.articles.length) throw new Error("Feed rebuilt with 0 stories");
    return `${feed.articles.length} stories`;
  },
} satisfies Task;
