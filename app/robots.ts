import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

// AI search and assistant crawlers are welcome: Sipply wants to be cited.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

const PRIVATE = ["/admin", "/api/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      // A named group replaces "*" for that bot, so it repeats the disallows
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    // Every story, and a Google News sitemap of the last 48 hours
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`],
  };
}
