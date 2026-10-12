import type { MetadataRoute } from "next";
import { getClusterIndex, isBuildPhase, type ApiClusterIndexEntry } from "@/lib/api/server";
import { SITE_URL, storyUrl } from "@/lib/seo/site";

// Regenerated at most hourly; new stories arrive 4× a day
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let stories: ApiClusterIndexEntry[] = [];
  try {
    stories = await getClusterIndex();
  } catch (err) {
    // Build: list the fixed pages only. Runtime: rethrow so the last good sitemap stays.
    if (!isBuildPhase()) throw err;
  }
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/archive`, changeFrequency: "daily", priority: 0.6 },
    ...stories.map((s) => ({
      url: storyUrl(s.id),
      lastModified: s.lastSeenAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
