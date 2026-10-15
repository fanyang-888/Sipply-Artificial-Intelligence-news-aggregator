import type { MetadataRoute } from "next";
import { getClusterIndex, getTopics, getWeeks } from "@/lib/api/server";
import { SITE_URL, storyUrl } from "@/lib/seo/site";

// Built per request instead of prerendered + ISR: on Vercel the prerendered
// sitemap (made while the API was still deploying) never refreshed. The story
// list itself is still cached for an hour in getClusterIndex's fetch cache, so
// this costs one cheap function call per crawler visit. If the API is down the
// request fails (500) and crawlers keep the sitemap they already have.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [stories, topics, weeks] = await Promise.all([
    getClusterIndex(),
    // Hub lists are extras: a failure there shouldn't cost the story URLs
    getTopics().catch(() => []),
    getWeeks().catch(() => []),
  ]);
  // The home page, radar and archive change with every pipeline run (4× a day)
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/radar`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/archive`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/topics`, changeFrequency: "daily", priority: 0.6 },
    ...topics.map((t) => ({
      url: `${SITE_URL}/topics/${t.slug}`,
      lastModified: t.latestAt ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    { url: `${SITE_URL}/weekly`, changeFrequency: "weekly", priority: 0.6 },
    ...weeks.map((w) => ({
      url: `${SITE_URL}/weekly/${w.week}`,
      lastModified: w.end,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...stories.map((s) => ({
      url: storyUrl(s.id),
      lastModified: s.lastSeenAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
