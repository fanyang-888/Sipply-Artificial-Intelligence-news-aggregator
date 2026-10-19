import type { MetadataRoute } from "next";
import { getClusterIndex, getDays, getTopics, getWeeks } from "@/lib/api/server";
import type { Lang } from "@/lib/i18n";
import { LANGS, localePath } from "@/lib/i18n/routing";
import { SITE_URL, storyPath } from "@/lib/seo/site";

// Built per request instead of prerendered + ISR: on Vercel the prerendered
// sitemap (made while the API was still deploying) never refreshed. The story
// list itself is still cached for an hour in getClusterIndex's fetch cache, so
// this costs one cheap function call per crawler visit. If the API is down the
// request fails (500) and crawlers keep the sitemap they already have.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [stories, topics, weeks, days] = await Promise.all([
    getClusterIndex(),
    // Hub lists are extras: a failure there shouldn't cost the story URLs
    getTopics().catch(() => []),
    getWeeks().catch(() => []),
    getDays().catch(() => []),
  ]);
  // The home page, radar and archive change with every pipeline run (4× a day)
  const now = new Date();
  type Entry = MetadataRoute.Sitemap[number];
  const pages: (Omit<Entry, "url"> & { path: string })[] = [
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
  // Every page in both languages, each naming the other (hreflang): English at the root, Chinese under /zh
  return pages.flatMap(({ path, ...entry }) => {
    const languages = { en: absolute(path, "en"), "zh-CN": absolute(path, "zh") };
    return LANGS.map((lang) => ({ ...entry, url: absolute(path, lang), alternates: { languages } }));
  });
}

function absolute(path: string, lang: Lang): string {
  const localized = localePath(path, lang);
  return `${SITE_URL}${localized}`;
}
