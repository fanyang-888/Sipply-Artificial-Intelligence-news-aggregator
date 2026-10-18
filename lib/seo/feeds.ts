/**
 * Machine feeds of the newest stories:
 * - /feed.xml, RSS 2.0, for readers, aggregators and crawlers that follow feeds;
 * - /news-sitemap.xml, a Google News sitemap of the last 48 hours (Bing reads it too).
 */

import type { ApiFeedItem } from "@/lib/api/types";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, storyUrl } from "@/lib/seo/site";

/** Google News sitemaps list articles published in the last two days. */
const NEWS_WINDOW_MS = 48 * 3_600_000;

function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function flat(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function describe(s: ApiFeedItem): string {
  const parts = [flat(s.summary)];
  if (s.whyItMatters) parts.push(`Why it matters: ${flat(s.whyItMatters)}`);
  if (s.sourceNames.length > 0) parts.push(`Sources: ${s.sourceNames.join(", ")}.`);
  return parts.filter(Boolean).join(" ");
}

export function buildRss(items: ApiFeedItem[], now: Date = new Date()): string {
  const entries = items.map((s) => {
    const url = storyUrl(s.id);
    return [
      "    <item>",
      `      <title>${xml(flat(s.title))}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      s.publishedAt ? `      <pubDate>${new Date(s.publishedAt).toUTCString()}</pubDate>` : null,
      s.topicTag ? `      <category>${xml(s.topicTag)}</category>` : null,
      `      <description>${xml(describe(s))}</description>`,
      "    </item>",
    ]
      .filter((line) => line !== null)
      .join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xml(`${SITE_NAME}: ${SITE_TAGLINE}`)}</title>`,
    `    <link>${SITE_URL}/</link>`,
    `    <description>${xml(SITE_DESCRIPTION)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    "    <ttl>60</ttl>",
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>`,
    ...entries,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function buildNewsSitemap(items: ApiFeedItem[], now: Date = new Date()): string {
  const recent = items.filter((s) => s.publishedAt && now.getTime() - new Date(s.publishedAt).getTime() <= NEWS_WINDOW_MS);
  const urls = recent.map((s) =>
    [
      "  <url>",
      `    <loc>${storyUrl(s.id)}</loc>`,
      "    <news:news>",
      "      <news:publication>",
      `        <news:name>${xml(SITE_NAME)}</news:name>`,
      "        <news:language>en</news:language>",
      "      </news:publication>",
      `      <news:publication_date>${new Date(s.publishedAt as string).toISOString()}</news:publication_date>`,
      `      <news:title>${xml(flat(s.title))}</news:title>`,
      "    </news:news>",
      "  </url>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
