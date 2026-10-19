import { describe, expect, it } from "vitest";
import type { ApiFeedItem } from "@/lib/api/types";
import { buildNewsSitemap, buildRss } from "./feeds";

function item(over: Partial<ApiFeedItem>): ApiFeedItem {
  return {
    id: "a1",
    title: "OpenAI & Anthropic <agree> on \"safety\"",
    titleZh: null,
    summary: "Both labs signed it.",
    whyItMatters: "It sets a floor for everyone.",
    topicTag: "Regulation",
    sourceNames: ["TechCrunch AI", "The Verge AI"],
    publishedAt: "2026-10-18T09:00:00+00:00",
    updatedAt: "2026-10-18T12:00:00+00:00",
    ...over,
  };
}

const NOW = new Date("2026-10-18T20:00:00Z");

describe("RSS feed", () => {
  const xml = buildRss([item({}), item({ id: "b2", title: "Older story", publishedAt: "2026-10-16T08:00:00+00:00" })], NOW);

  it("is an RSS 2.0 channel that points at itself", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<atom:link href="https://www.sipply.dev/feed.xml" rel="self" type="application/rss+xml"/>');
    expect(xml).toContain("<lastBuildDate>Sun, 18 Oct 2026 20:00:00 GMT</lastBuildDate>");
  });

  it("lists each story with its link, date, category and escaped text", () => {
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("<title>OpenAI &amp; Anthropic &lt;agree&gt; on &quot;safety&quot;</title>");
    expect(xml).toContain("<link>https://www.sipply.dev/cluster/a1</link>");
    expect(xml).toContain('<guid isPermaLink="true">https://www.sipply.dev/cluster/a1</guid>');
    expect(xml).toContain("<pubDate>Sun, 18 Oct 2026 09:00:00 GMT</pubDate>");
    expect(xml).toContain("<category>Regulation</category>");
    expect(xml).toContain("Both labs signed it. Why it matters: It sets a floor for everyone. Sources: TechCrunch AI, The Verge AI.");
    expect(xml).not.toContain("<agree>");
  });
});

describe("news sitemap", () => {
  const xml = buildNewsSitemap(
    [
      item({}),
      item({ id: "b2", title: "Two days old", publishedAt: "2026-10-16T19:00:00+00:00" }),
      item({ id: "c3", title: "No date", publishedAt: null }),
    ],
    NOW,
  );

  it("lists only stories from the last 48 hours, as Google News asks", () => {
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain("<loc>https://www.sipply.dev/cluster/a1</loc>");
    expect(xml).not.toContain("/cluster/b2");
    expect(xml).not.toContain("/cluster/c3");
  });

  it("lists the Chinese page of a story with a Chinese title too", () => {
    const zh = buildNewsSitemap([item({ slug: "a1-story", titleZh: "OpenAI 与 Anthropic 达成安全共识" })], NOW);
    expect(zh).toContain("<loc>https://www.sipply.dev/zh/story/a1-story</loc>");
    expect(zh).toContain("<news:language>zh-cn</news:language>");
    expect(zh).toContain("<news:title>OpenAI 与 Anthropic 达成安全共识</news:title>");
    expect(zh.match(/<url>/g)).toHaveLength(2);
  });

  it("names the publication, language, date and escaped title", () => {
    expect(xml).toContain("<news:name>Sipply</news:name>");
    expect(xml).toContain("<news:language>en</news:language>");
    expect(xml).toContain("<news:publication_date>2026-10-18T09:00:00.000Z</news:publication_date>");
    expect(xml).toContain("<news:title>OpenAI &amp; Anthropic &lt;agree&gt; on &quot;safety&quot;</news:title>");
  });
});
