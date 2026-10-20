import { describe, expect, it } from "vitest";
import { buildSitemapXml, sitemapEntries } from "./sitemap";

const NOW = new Date("2026-10-20T20:19:50.780Z");

describe("sitemap.xml", () => {
  const entries = sitemapEntries(
    {
      stories: [{ id: "92dd21b4-0000-0000-0000-000000000000", slug: "introducing-the-child-safety-blueprint-92dd21b4", lastSeenAt: "2026-04-08T05:00:00+00:00" }],
      topics: [{ slug: "anthropic", latestAt: "2026-10-20T10:00:00+00:00" }],
      weeks: [{ week: "2026-W43", end: "2026-10-25" }],
      days: [{ date: "2026-10-20" }, { date: "2026-10-19" }],
    },
    NOW,
  );
  const xml = buildSitemapXml(entries);

  it("lists every page in both languages, each naming the other", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">')).toBe(true);
    expect(xml).toContain(
      [
        "<url>",
        "<loc>https://www.sipply.dev/zh/story/introducing-the-child-safety-blueprint-92dd21b4</loc>",
        '<xhtml:link rel="alternate" hreflang="en" href="https://www.sipply.dev/story/introducing-the-child-safety-blueprint-92dd21b4" />',
        '<xhtml:link rel="alternate" hreflang="zh-CN" href="https://www.sipply.dev/zh/story/introducing-the-child-safety-blueprint-92dd21b4" />',
        "<lastmod>2026-04-08T05:00:00+00:00</lastmod>",
        "<changefreq>weekly</changefreq>",
        "<priority>0.5</priority>",
        "</url>",
      ].join("\n"),
    );
    expect(xml).toContain("<loc>https://www.sipply.dev/</loc>\n<xhtml:link rel=\"alternate\" hreflang=\"en\" href=\"https://www.sipply.dev/\" />\n<xhtml:link rel=\"alternate\" hreflang=\"zh-CN\" href=\"https://www.sipply.dev/zh\" />\n<lastmod>2026-10-20T20:19:50.780Z</lastmod>\n<changefreq>hourly</changefreq>\n<priority>1</priority>");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("has the hubs, each topic, week and day, today's page marked as changing", () => {
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain("https://www.sipply.dev/topics/anthropic");
    expect(locs).toContain("https://www.sipply.dev/zh/weekly/2026-W43");
    expect(xml).toContain("<loc>https://www.sipply.dev/daily/2026-10-19</loc>\n<xhtml:link rel=\"alternate\" hreflang=\"en\" href=\"https://www.sipply.dev/daily/2026-10-19\" />\n<xhtml:link rel=\"alternate\" hreflang=\"zh-CN\" href=\"https://www.sipply.dev/zh/daily/2026-10-19\" />\n<lastmod>2026-10-19T23:59:59Z</lastmod>\n<changefreq>monthly</changefreq>");
    expect(locs.length).toBe(entries.length);
    expect(new Set(locs).size).toBe(locs.length);
  });

  it("escapes what XML needs escaped and leaves out what a page doesn't have", () => {
    const one = buildSitemapXml([{ url: "https://www.sipply.dev/topics/a&b", alternates: { languages: {} } }]);
    expect(one).toContain("<loc>https://www.sipply.dev/topics/a&amp;b</loc>");
    expect(one).not.toContain("<lastmod>");
    expect(one).not.toContain("<priority>");
  });
});
