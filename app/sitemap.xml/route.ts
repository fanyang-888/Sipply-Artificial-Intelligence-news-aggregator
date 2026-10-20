import { getClusterIndex, getDays, getTopics, getWeeks, isBuildPhase } from "@/lib/api/server";
import { buildSitemapXml, sitemapEntries } from "@/lib/seo/sitemap";

// Cached, and rebuilt when the pipeline marks a run's data stale ("run" tag,
// lib/api/cache-policy.ts); a day at most. Built per request it took 5-8 s for
// ~16K URLs (4 MB) on every crawler visit. A route handler, not app/sitemap.ts:
// on Vercel that metadata route kept its build-time copy whatever was refreshed.
// A failed rebuild keeps the last good sitemap; a build without the API makes
// one of the hub pages only, until the next run.
export const revalidate = 86400;

export async function GET() {
  const [stories, topics, weeks, days] = await Promise.all([
    getClusterIndex().catch((err) => {
      if (isBuildPhase()) return [];
      throw err;
    }),
    // Hub lists are extras: a failure there shouldn't cost the story URLs
    getTopics().catch(() => []),
    getWeeks().catch(() => []),
    getDays().catch(() => []),
  ]);
  const xml = buildSitemapXml(sitemapEntries({ stories, topics, weeks, days }, new Date()));
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
