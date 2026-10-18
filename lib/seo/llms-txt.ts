/**
 * /llms.txt — a plain-markdown map of the site for LLMs (https://llmstxt.org).
 */

import type { ApiDigest } from "@/lib/api/types";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, storyUrl } from "@/lib/seo/site";

function oneLine(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function buildLlmsTxt(digest: ApiDigest | null): string {
  const lines = [
    `# ${SITE_NAME} — ${SITE_TAGLINE}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Stories update four times a day. Every story page carries a summary, key takeaways, why it matters " +
      "(overall and for product managers, developers and students), and links to all the source articles " +
      "it is based on. Content is in English with a Chinese translation.",
    "",
    "## Main pages",
    "",
    `- [Daily Digest](${SITE_URL}/): today's ranked AI stories`,
    `- [Trend Radar](${SITE_URL}/radar): what the AI community is discussing — Hacker News, Bluesky, ` +
      "Lobsters, news, YouTube, DEV and new GitHub repos grouped into topics, scored by volume, " +
      "engagement and how fast they are rising, " +
      "plus the questions people are asking",
    `- [Archive](${SITE_URL}/archive): every story, searchable by keyword and category`,
    `- [Companies & models](${SITE_URL}/topics): every story about OpenAI, Anthropic, Google & Gemini, Meta, ` +
      "DeepSeek and other AI companies and model families, one page each",
    `- [Weekly recaps](${SITE_URL}/weekly): the top AI stories of each week, by category and company`,
    `- [AI news by day](${SITE_URL}/daily): one page per day (UTC) with every story from that day, ` +
      `news first; today's is ${SITE_URL}/daily/${new Date().toISOString().slice(0, 10)}`,
  ];

  const stories = digest ? [digest.featured, ...digest.topClusters].filter((c) => c != null) : [];
  if (stories.length > 0) {
    lines.push("", "## Today's top stories", "");
    const seen = new Set<string>();
    for (const c of stories) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const summary = c.summary.en ? `: ${oneLine(c.summary.en)}` : "";
      lines.push(`- [${oneLine(c.title.en, 160)}](${storyUrl(c)})${summary}`);
    }
  }

  lines.push(
    "",
    "## Optional",
    "",
    `- [RSS feed](${SITE_URL}/feed.xml): the 50 newest stories with summaries and sources`,
    `- [Sitemap](${SITE_URL}/sitemap.xml): every story page with its last update`,
    `- [News sitemap](${SITE_URL}/news-sitemap.xml): stories from the last 48 hours`,
    "",
  );
  return lines.join("\n");
}
