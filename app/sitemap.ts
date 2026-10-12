import type { MetadataRoute } from "next";
import { getClusterIndex } from "@/lib/api/server";
import { SITE_URL, storyUrl } from "@/lib/seo/site";

// Built per request instead of prerendered + ISR: on Vercel the prerendered
// sitemap (made while the API was still deploying) never refreshed. The story
// list itself is still cached for an hour in getClusterIndex's fetch cache, so
// this costs one cheap function call per crawler visit. If the API is down the
// request fails (500) and crawlers keep the sitemap they already have.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories = await getClusterIndex();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/radar`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/archive`, changeFrequency: "daily", priority: 0.6 },
    ...stories.map((s) => ({
      url: storyUrl(s.id),
      lastModified: s.lastSeenAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
