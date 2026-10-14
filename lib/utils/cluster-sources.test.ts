import { describe, expect, it } from "vitest";
import type { Article } from "@/types/article";
import { primarySource } from "@/lib/utils/cluster-sources";

const article = (o: Partial<Article>): Article => ({
  id: "a",
  clusterId: "c",
  sourceId: "",
  title: "Title",
  url: "https://www.techcrunch.com/2026/10/14/x",
  publishedAt: "",
  excerpt: "",
  tags: [],
  themes: [],
  ...o,
});

describe("primarySource", () => {
  it("links the first (most relevant) article, named by its outlet", () => {
    const s = primarySource({ articles: [article({ organizationName: "TechCrunch AI" }), article({ url: "https://b.example/" })] });
    expect(s).toEqual({ url: "https://www.techcrunch.com/2026/10/14/x", name: "TechCrunch AI", title: "Title" });
  });

  it("falls back to the domain, and skips articles without a web URL", () => {
    expect(primarySource({ articles: [article({ url: "" }), article({ url: "https://www.arxiv.org/abs/1" })] })?.name).toBe("arxiv.org");
    expect(primarySource({ articles: [] })).toBeNull();
    expect(primarySource({})).toBeNull();
  });
});
