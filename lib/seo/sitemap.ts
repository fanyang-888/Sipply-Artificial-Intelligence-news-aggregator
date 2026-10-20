/**
 * sitemap.xml: every page in both languages, each naming the other (hreflang).
 *
 * Built by hand rather than by app/sitemap.ts (a metadata route): on Vercel the
 * metadata route kept its build-time copy and ignored the pipeline's refresh by
 * tag and by path (2026-10-20), while route handlers like news-sitemap.xml are
 * refreshed. The output matches what the metadata route made.
 */

import type { Lang } from "@/lib/i18n";
import { LANGS, localePath } from "@/lib/i18n/routing";
import { SITE_URL, storyPath } from "@/lib/seo/site";

type ChangeFrequency = "hourly" | "daily" | "weekly" | "monthly";

export type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: ChangeFrequency;
  priority?: number;
  alternates: { languages: Record<string, string> };
};

export type SitemapSources = {
  stories: { id: string; slug?: string; lastSeenAt: string | null }[];
  topics: { slug: string; latestAt?: string | null }[];
  weeks: { week: string; end: string }[];
  days: { date: string }[];
};

function absolute(path: string, lang: Lang): string {
  return `${SITE_URL}${localePath(path, lang)}`;
}

/** The site's pages, newest-changing first, each in English then Chinese. */
export function sitemapEntries({ stories, topics, weeks, days }: SitemapSources, now: Date): SitemapEntry[] {
  // The home page, radar and archive change with every pipeline run (4× a day)
  const pages: (Omit<SitemapEntry, "url" | "alternates"> & { path: string })[] = [
    { path: "/", lastModified: now, changeFrequency: "hourly", priority: 1 },
    { path: "/radar", lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { path: "/archive", lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { path: "/topics", changeFrequency: "daily", priority: 0.6 },
    ...topics.map((t) => ({
      path: `/topics/${t.slug}`,
      lastModified: t.latestAt ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    { path: "/weekly", changeFrequency: "weekly", priority: 0.6 },
    ...weeks.map((w) => ({
      path: `/weekly/${w.week}`,
      lastModified: w.end,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    { path: "/daily", lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    // Today's page changes with every run; a finished day is settled
    ...days.map((d, i) => ({
      path: `/daily/${d.date}`,
      lastModified: i === 0 ? now : `${d.date}T23:59:59Z`,
      changeFrequency: i === 0 ? ("hourly" as const) : ("monthly" as const),
      priority: i === 0 ? 0.8 : 0.5,
    })),
    ...stories.map((s) => ({
      path: storyPath(s),
      lastModified: s.lastSeenAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
  return pages.flatMap(({ path, ...entry }) => {
    const languages = { en: absolute(path, "en"), "zh-CN": absolute(path, "zh") };
    return LANGS.map((lang) => ({ ...entry, url: absolute(path, lang), alternates: { languages } }));
  });
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((e) => {
    const lines = ["<url>", `<loc>${xml(e.url)}</loc>`];
    for (const [lang, href] of Object.entries(e.alternates.languages)) {
      lines.push(`<xhtml:link rel="alternate" hreflang="${xml(lang)}" href="${xml(href)}" />`);
    }
    if (e.lastModified) {
      const when = e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified;
      lines.push(`<lastmod>${xml(when)}</lastmod>`);
    }
    if (e.changeFrequency) lines.push(`<changefreq>${e.changeFrequency}</changefreq>`);
    if (e.priority !== undefined) lines.push(`<priority>${e.priority}</priority>`);
    lines.push("</url>");
    return lines.join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
