/**
 * The sitemaps: /sitemap.xml is an index of /sitemaps/pages.xml (the hub pages)
 * and /sitemaps/stories-<n>.xml (STORIES_PER_SITEMAP stories each), every page in
 * both languages, each naming the other (hreflang).
 *
 * Split because one 4 MB sitemap (16K URLs) was never rebuilt on Vercel when the
 * pipeline marked it stale, neither as app/sitemap.ts nor as a route handler, while
 * the 40-60 KB news sitemap and RSS feed were (2026-10-20). Each file here stays
 * around 260 KB. The entries match what app/sitemap.ts made.
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

export type PageSources = {
  topics: { slug: string; latestAt?: string | null }[];
  weeks: { week: string; end: string }[];
  days: { date: string }[];
};

export type IndexedStory = { id: string; slug?: string; lastSeenAt: string | null };

/** Stories per sitemap: 500 URLs with both languages, about 260 KB. */
export const STORIES_PER_SITEMAP = 250;

function absolute(path: string, lang: Lang): string {
  return `${SITE_URL}${localePath(path, lang)}`;
}

type PageEntry = Omit<SitemapEntry, "url" | "alternates"> & { path: string };

/** Each page in English then Chinese, each naming the other (hreflang). */
function inBothLanguages(pages: PageEntry[]): SitemapEntry[] {
  return pages.flatMap(({ path, ...entry }) => {
    const languages = { en: absolute(path, "en"), "zh-CN": absolute(path, "zh") };
    return LANGS.map((lang) => ({ ...entry, url: absolute(path, lang), alternates: { languages } }));
  });
}

/** The files the index lists: the hub pages, then one per STORIES_PER_SITEMAP stories. */
export function sitemapFiles(storyCount: number): string[] {
  const chunks = Math.ceil(storyCount / STORIES_PER_SITEMAP);
  return ["pages.xml", ...Array.from({ length: chunks }, (_, i) => `stories-${i}.xml`)];
}

/** The hub pages, each topic, week and day. */
export function pageEntries({ topics, weeks, days }: PageSources, now: Date): SitemapEntry[] {
  // The home page, radar and archive change with every pipeline run (4× a day)
  return inBothLanguages([
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
  ]);
}

/** Sitemap ``chunk`` of the stories. ``stories`` come newest first (the API's order); files
 * count from the oldest, so a file keeps its stories and only the last one grows. */
export function storyEntries(stories: IndexedStory[], chunk: number): SitemapEntry[] {
  const oldestFirst = [...stories].reverse();
  const slice = oldestFirst.slice(chunk * STORIES_PER_SITEMAP, (chunk + 1) * STORIES_PER_SITEMAP);
  return inBothLanguages(
    slice.map((s) => ({
      path: storyPath(s),
      lastModified: s.lastSeenAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  );
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildSitemapIndexXml(files: string[], now: Date): string {
  const items = files.map(
    (f) => `<sitemap>\n<loc>${xml(`${SITE_URL}/sitemaps/${f}`)}</loc>\n<lastmod>${now.toISOString()}</lastmod>\n</sitemap>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items,
    "</sitemapindex>",
    "",
  ].join("\n");
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
