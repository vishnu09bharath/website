import { refreshOverviewStats } from "../lib/overview";
import type { Task } from "./types";

export default {
  id: "overview-stats",
  title: "Refresh overview stats",
  description: "Pulls GitHub repo activity and Cloudflare Web Analytics traffic for the /admin Overview.",
  schedule: { every: 60 },
  async run(env) {
    const stats = await refreshOverviewStats(env);
    const errors = [stats.github.error, stats.traffic.error].filter(Boolean);
    if (errors.length) throw new Error(errors.join(" · "));
    return stats.traffic.configured ? "GitHub + traffic updated" : "GitHub updated (traffic not configured)";
  },
} satisfies Task;
