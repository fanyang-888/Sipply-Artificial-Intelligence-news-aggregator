import { describe, expect, it } from "vitest";
import type { ApiCluster, ApiDigest } from "@/lib/api/types";
import { digestItemListJsonLd, newsArticleJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import { SITE_URL, storyUrl } from "@/lib/seo/site";

const loc = (en: string) => ({ en, zh: null });

function cluster(id: string, title: string, overrides: Partial<ApiCluster> = {}): ApiCluster {
  return {
    id,
    clusterType: "event",
    title: loc(title),
    theme: "",
    themes: [],
    tags: ["agents"],
    topicTag: "Product Launch",
    storyStatus: "new",
    clusterScore: 80,
    freshnessLabel: "",
    firstSeenAt: "2026-10-10T08:00:00+00:00",
    lastSeenAt: "2026-10-11T08:00:00+00:00",
    summary: loc("A summary."),
    takeaways: [],
    whyItMatters: loc(""),
    audience: { pm: loc(""), developer: loc(""), studentJobSeeker: loc("") },
    articleIds: ["a1"],
    articles: [
      { id: "a1", title: "Source headline", url: "https://news.example/a1", sourceName: "Example News", publishedAt: null, excerpt: null },
    ],
    relatedClusterIds: [],
    articleCount: 1,
    sourceCount: 1,
    ...overrides,
  };
}

describe("site urls", () => {
  it("uses the canonical www origin by default", () => {
    expect(SITE_URL).toBe("https://www.sipply.dev");
    expect(storyUrl("abc")).toBe("https://www.sipply.dev/cluster/abc");
  });
});

describe("newsArticleJsonLd", () => {
  it("describes the story and cites its sources", () => {
    const ld = newsArticleJsonLd(cluster("c1", "Big launch"));
    expect(ld["@type"]).toBe("NewsArticle");
    expect(ld.url).toBe("https://www.sipply.dev/cluster/c1");
    expect(ld.datePublished).toBe("2026-10-10T08:00:00+00:00");
    expect(ld.isBasedOn).toEqual(["https://news.example/a1"]);
    expect(ld.citation).toEqual([
      { "@type": "NewsArticle", headline: "Source headline", url: "https://news.example/a1", publisher: { "@type": "Organization", name: "Example News" } },
    ].map((c) => expect.objectContaining(c)));
  });

  it("clips long headlines to 110 characters", () => {
    const ld = newsArticleJsonLd(cluster("c1", "x".repeat(200)));
    expect((ld.headline as string).length).toBe(110);
  });
});

describe("digestItemListJsonLd", () => {
  it("lists the featured story first, without duplicates", () => {
    const digest: ApiDigest = {
      date: "",
      featured: cluster("f", "Featured"),
      topClusters: [cluster("f", "Featured"), cluster("t1", "Second")],
    };
    const ld = digestItemListJsonLd(digest);
    const items = ld.itemListElement as { position: number; url: string }[];
    expect(items.map((i) => i.url)).toEqual([storyUrl("f"), storyUrl("t1")]);
    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.numberOfItems).toBe(2);
  });
});

describe("serializeJsonLd", () => {
  it("cannot be broken out of with a closing script tag", () => {
    const out = serializeJsonLd({ headline: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).headline).toBe("</script><script>alert(1)</script>");
  });
});

describe("buildLlmsTxt", () => {
  it("links the main pages and today's stories", () => {
    const txt = buildLlmsTxt({ date: "", featured: cluster("f", "Featured"), topClusters: [cluster("t1", "Second")] });
    expect(txt.startsWith("# Sipply\n\n> ")).toBe(true);
    expect(txt).toContain("- [Daily Digest](https://www.sipply.dev/)");
    expect(txt).toContain("- [Featured](https://www.sipply.dev/cluster/f): A summary.");
    expect(txt).toContain("- [Second](https://www.sipply.dev/cluster/t1)");
    expect(txt).toContain("(https://www.sipply.dev/sitemap.xml)");
  });

  it("still describes the site when the digest is unavailable", () => {
    const txt = buildLlmsTxt(null);
    expect(txt).toContain("## Main pages");
    expect(txt).not.toContain("## Today's top stories");
  });
});
