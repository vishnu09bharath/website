// RSS sources for the private /news dashboard. Each outlet exposes a public RSS
// feed (no API keys); the dashboard fetches these, pools them, and lets the
// Workers AI REST API rank the most relevant stories.
//
// To add an outlet: drop in another { name, rss, home } entry. `logo` is
// optional — when omitted the UI falls back to the site's favicon (see
// sourceLogo in ../lib/news.ts).

export type Feed = {
  /** Display name shown on each pane (the outlet brand). */
  name: string;
  /** Public RSS/Atom feed URL. */
  rss: string;
  /** Outlet homepage — used to derive a favicon when `logo` is unset. */
  home: string;
  /** Optional explicit logo/icon URL. */
  logo?: string;
  /**
   * Feed is a Google News search (used for outlets with no native RSS, e.g. AP
   * and Reuters). Titles get a " - Publisher" suffix that we strip on ingest.
   */
  googleNews?: boolean;
};

// Whitelist: the outlets in Vishnu's iOS News folder (Apple News itself has no
// public RSS, so it's omitted) plus The Economist and the Financial Times.
export const FEEDS: Feed[] = [
  { name: "NYTimes",        rss: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",  home: "https://www.nytimes.com" },
  // AP and Reuters no longer publish usable public RSS — pull via Google News.
  { name: "AP News",        rss: "https://news.google.com/rss/search?q=site:apnews.com+when:2d&hl=en-US&gl=US&ceid=US:en",   home: "https://apnews.com",      googleNews: true },
  { name: "Reuters",        rss: "https://news.google.com/rss/search?q=site:reuters.com+when:2d&hl=en-US&gl=US&ceid=US:en", home: "https://www.reuters.com", googleNews: true },
  { name: "Washington Post", rss: "https://feeds.washingtonpost.com/rss/world",                home: "https://www.washingtonpost.com" },
  { name: "WSJ",            rss: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",                home: "https://www.wsj.com" },
  { name: "BBC News",       rss: "https://feeds.bbci.co.uk/news/world/rss.xml",               home: "https://www.bbc.com/news" },
  { name: "NPR",            rss: "https://feeds.npr.org/1001/rss.xml",                         home: "https://www.npr.org" },
  { name: "The Atlantic",   rss: "https://www.theatlantic.com/feed/all/",                      home: "https://www.theatlantic.com" },
  { name: "The Economist",  rss: "https://www.economist.com/latest/rss.xml",                   home: "https://www.economist.com" },
  { name: "Financial Times", rss: "https://www.ft.com/rss/home",                              home: "https://www.ft.com" },
];
