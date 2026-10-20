import { describe, expect, it } from "vitest";
import type { ApiCluster, ApiFeedItem } from "@/lib/api/types";
import { llmsFullTxt, storyMarkdown } from "./markdown";

const L = (en: string, zh: string | null = null) => ({ en, zh });

const story = {
  id: "ac94574a-93c6-4a1e-9593-a6e17e04b56e",
  slug: "replit-drops-anthropic-ac94574a",
  title: L("Replit drops Anthropic for OpenAI", "Replit 弃用 Anthropic，改用 OpenAI"),
  summary: L("Replit's CEO said the company no longer works with Anthropic.", "Replit 首席执行官表示公司不再与 Anthropic 合作。"),
  takeaways: [L("Cost was a reason", "成本是原因之一"), L("OpenAI performs better for Replit", "OpenAI 对 Replit 表现更好")],
  whyItMatters: L("Model providers compete for coding tools.", "模型厂商在争夺编程工具。"),
  audience: { pm: L("Expect vendor churn."), developer: L("Benchmark providers yourself."), studentJobSeeker: L("Learn several model APIs.") },
  topicTag: "Product Launch",
  firstSeenAt: "2026-10-16T21:22:28+00:00",
  lastSeenAt: "2026-10-17T18:48:08+00:00",
  articles: [{ id: "1", title: "Replit is no longer working with Anthropic, CEO says", url: "https://techcrunch.com/x", sourceName: "TechCrunch AI", publishedAt: "2026-10-16T21:00:00+00:00", excerpt: null }],
} as unknown as ApiCluster;

describe("a story as markdown", () => {
  const md = storyMarkdown(story);

  it("starts with the headline and names both of the story's addresses", () => {
    expect(md.startsWith("# Replit drops Anthropic for OpenAI\n")).toBe(true);
    expect(md).toContain("https://www.sipply.dev/story/replit-drops-anthropic-ac94574a");
    expect(md).toContain("https://www.sipply.dev/zh/story/replit-drops-anthropic-ac94574a");
    expect(md).toContain("Published: 2026-10-16");
  });

  it("carries the summary, takeaways, why it matters per reader and the sources", () => {
    expect(md).toContain("## Summary\n\nReplit's CEO said the company no longer works with Anthropic.");
    expect(md).toContain("- Cost was a reason");
    expect(md).toContain("- **Product managers:** Expect vendor churn.");
    expect(md).toContain("- [Replit is no longer working with Anthropic, CEO says](https://techcrunch.com/x) (TechCrunch AI, 2026-10-16)");
  });

  it("ends with the Chinese version", () => {
    expect(md).toContain("## 中文\n\n### Replit 弃用 Anthropic，改用 OpenAI");
    expect(md).toContain("- 成本是原因之一");
    expect(md).toContain("**为什么重要：** 模型厂商在争夺编程工具。");
  });
});

describe("llms-full.txt", () => {
  const item: ApiFeedItem = {
    id: "a1", slug: "a1-story", title: "Gemini 4 Argon opens to all", titleZh: null, summary: "Google widened access.",
    whyItMatters: "Developers can build on it.", topicTag: "Model Release", sourceNames: ["Google DeepMind Blog"],
    publishedAt: "2026-10-13T08:00:00+00:00", updatedAt: null,
  };
  const txt = llmsFullTxt([item], new Date("2026-10-19T00:00:00Z"));

  it("describes the site, then gives each story in full", () => {
    expect(txt.startsWith("# Sipply")).toBe(true);
    expect(txt).toContain("## Gemini 4 Argon opens to all");
    expect(txt).toContain("https://www.sipply.dev/story/a1-story");
    expect(txt).toContain("Google widened access.");
    expect(txt).toContain("Why it matters: Developers can build on it.");
    expect(txt).toContain("Sources: Google DeepMind Blog");
  });

  it("dates itself by its newest story, so the cached file only changes when the stories do", () => {
    const later = { ...item, id: "b2", slug: "b2-story", publishedAt: "2026-10-14T09:30:00+00:00", updatedAt: "2026-10-15T10:45:00+00:00" };
    const a = llmsFullTxt([item, later], new Date("2026-10-19T00:00:00Z"));
    const b = llmsFullTxt([item, later], new Date("2026-10-19T00:05:00Z"));
    expect(a).toBe(b);
    expect(a).toContain("as of 2026-10-15T10:45Z");
  });
});
