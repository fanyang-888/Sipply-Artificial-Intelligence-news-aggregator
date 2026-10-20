import { describe, expect, it } from "vitest";
import { buildSitemapIndexXml, buildSitemapXml, pageEntries, sitemapFiles, storyEntries } from "./sitemap";

const NOW = new Date("2026-10-20T20:19:50.780Z");
const story = (n: number, seen = "2026-04-08T05:00:00+00:00") => ({
  id: `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`,
  slug: `story-${n}-${String(n).padStart(8, "0")}`,
  lastSeenAt: seen,
});

describe("sitemap index", () => {
  it("lists the pages sitemap, one sitemap per 250 stories, and room for the next 2,000", () => {
    // On Vercel /sitemap.xml keeps its build-time copy, so it names files new stories will fill
    const stories = (n: number) => Array.from({ length: n }, (_, i) => `stories-${i}.xml`);
    expect(sitemapFiles(0)).toEqual(["pages.xml", ...stories(8)]);
    expect(sitemapFiles(250)).toEqual(["pages.xml", ...stories(9)]);
    expect(sitemapFiles(501)).toEqual(["pages.xml", ...stories(11)]);
    const xml = buildSitemapIndexXml(["pages.xml", "stories-0.xml"]);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<sitemap>\n<loc>https://www.sipply.dev/sitemaps/stories-0.xml</loc>\n</sitemap>");
    expect(xml).not.toContain("<lastmod>");  // it would stay the build time
  });
});

describe("sitemaps", () => {
  it("gives each story in both languages, each naming the other, oldest first so a file keeps its stories", () => {
    const stories = [story(2, "2026-10-19T05:00:00+00:00"), story(1)]; // the API lists newest first
    const xml = buildSitemapXml(storyEntries(stories, 0));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">')).toBe(true);
    expect(xml).toContain(
      [
        "<url>",
        "<loc>https://www.sipply.dev/zh/story/story-1-00000001</loc>",
        '<xhtml:link rel="alternate" hreflang="en" href="https://www.sipply.dev/story/story-1-00000001" />',
        '<xhtml:link rel="alternate" hreflang="zh-CN" href="https://www.sipply.dev/zh/story/story-1-00000001" />',
        "<lastmod>2026-04-08T05:00:00+00:00</lastmod>",
        "<changefreq>weekly</changefreq>",
        "<priority>0.5</priority>",
        "</url>",
      ].join("\n"),
    );
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs[0]).toBe("https://www.sipply.dev/story/story-1-00000001");
    const many = Array.from({ length: 625 }, (_, i) => story(625 - i));
    expect(storyEntries(many, 1).length).toBe(500);
    expect(storyEntries(many, 2)[0].url).toBe("https://www.sipply.dev/story/story-501-00000501");
    expect(storyEntries(many, 3)).toEqual([]);
  });

  it("gives the hubs, each topic, week and day, today's page marked as changing", () => {
    const xml = buildSitemapXml(
      pageEntries(
        { topics: [{ slug: "anthropic", latestAt: "2026-10-20T10:00:00+00:00" }], weeks: [{ week: "2026-W43", end: "2026-10-25" }], days: [{ date: "2026-10-20" }, { date: "2026-10-19" }] },
        NOW,
      ),
    );
    expect(xml).toContain('<loc>https://www.sipply.dev/</loc>\n<xhtml:link rel="alternate" hreflang="en" href="https://www.sipply.dev/" />\n<xhtml:link rel="alternate" hreflang="zh-CN" href="https://www.sipply.dev/zh" />\n<lastmod>2026-10-20T20:19:50.780Z</lastmod>\n<changefreq>hourly</changefreq>\n<priority>1</priority>');
    expect(xml).toContain("<loc>https://www.sipply.dev/topics/anthropic</loc>");
    expect(xml).toContain("<loc>https://www.sipply.dev/zh/weekly/2026-W43</loc>");
    expect(xml).toContain('<loc>https://www.sipply.dev/daily/2026-10-19</loc>\n<xhtml:link rel="alternate" hreflang="en" href="https://www.sipply.dev/daily/2026-10-19" />\n<xhtml:link rel="alternate" hreflang="zh-CN" href="https://www.sipply.dev/zh/daily/2026-10-19" />\n<lastmod>2026-10-19T23:59:59Z</lastmod>\n<changefreq>monthly</changefreq>');
  });

  it("escapes what XML needs escaped and leaves out what a page doesn't have", () => {
    const one = buildSitemapXml([{ url: "https://www.sipply.dev/topics/a&b", alternates: { languages: {} } }]);
    expect(one).toContain("<loc>https://www.sipply.dev/topics/a&amp;b</loc>");
    expect(one).not.toContain("<lastmod>");
    expect(one).not.toContain("<priority>");
  });
});
