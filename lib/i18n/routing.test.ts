import { describe, expect, it } from "vitest";
import { isLocalizable, localePath, pageAlternates, splitLocale } from "./routing";

describe("language in the URL", () => {
  it("puts Chinese pages under /zh and leaves English ones as they are", () => {
    expect(localePath("/", "zh")).toBe("/zh");
    expect(localePath("/story/replit-drops-anthropic-ac94574a", "zh")).toBe("/zh/story/replit-drops-anthropic-ac94574a");
    expect(localePath("/archive?q=gpt&topic=models", "zh")).toBe("/zh/archive?q=gpt&topic=models");
    expect(localePath("/?ref=x", "zh")).toBe("/zh?ref=x");
    expect(localePath("/radar", "en")).toBe("/radar");
  });

  it("never prefixes twice, nor machine files, admin, API or other sites", () => {
    expect(localePath("/zh/radar", "zh")).toBe("/zh/radar");
    for (const path of ["/feed.xml", "/llms.txt", "/sitemap.xml", "/admin/pipeline-runs", "/api/admin-auth", "/cluster/abc", "https://techcrunch.com/x", "#today", "mailto:a@b.c"]) {
      expect(localePath(path, "zh")).toBe(path);
    }
  });

  it("reads the language back out of a path", () => {
    expect(splitLocale("/zh")).toEqual({ lang: "zh", path: "/" });
    expect(splitLocale("/zh/story/x-1")).toEqual({ lang: "zh", path: "/story/x-1" });
    expect(splitLocale("/zhuhai")).toEqual({ lang: "en", path: "/zhuhai" });
    expect(splitLocale("/weekly/2026-W42")).toEqual({ lang: "en", path: "/weekly/2026-W42" });
  });

  it("knows which pages have a Chinese version", () => {
    for (const path of ["/", "/story/x-1", "/archive", "/radar", "/topics", "/topics/openai", "/weekly", "/weekly/2026-W42", "/daily", "/daily/2026-10-18"]) {
      expect(isLocalizable(path)).toBe(true);
    }
    for (const path of ["/admin", "/feed.xml", "/cluster/abc", "/stories", "/radarx"]) {
      expect(isLocalizable(path)).toBe(false);
    }
  });

  it("gives every page its canonical URL and both languages for hreflang", () => {
    expect(pageAlternates("/radar", "zh")).toEqual({
      canonical: "/zh/radar",
      languages: { en: "/radar", "zh-CN": "/zh/radar", "x-default": "/radar" },
    });
    expect(pageAlternates("/", "en")).toEqual({
      canonical: "/",
      languages: { en: "/", "zh-CN": "/zh", "x-default": "/" },
    });
  });
});
