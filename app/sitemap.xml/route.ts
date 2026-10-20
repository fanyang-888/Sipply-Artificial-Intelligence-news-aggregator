import { getClusterIndex, isBuildPhase } from "@/lib/api/server";
import { buildSitemapIndexXml, sitemapFiles } from "@/lib/seo/sitemap";

// The sitemap index (/sitemaps/pages.xml and /sitemaps/stories-<n>.xml, see
// lib/seo/sitemap.ts). Cached, and rebuilt when the pipeline marks a run's data
// stale ("run" tag, lib/api/cache-policy.ts); a day at most. A failed rebuild keeps
// the last good copy; a build without the API lists the pages sitemap only.
export const revalidate = 86400;

export async function GET() {
  const stories = await getClusterIndex().catch((err) => {
    if (isBuildPhase()) return [];
    throw err;
  });
  return new Response(buildSitemapIndexXml(sitemapFiles(stories.length), new Date()), {
    headers: { "Content-Type": "application/xml" },
  });
}
