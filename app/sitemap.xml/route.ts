import { getClusterIndex, isBuildPhase } from "@/lib/api/server";
import { buildSitemapIndexXml, sitemapFiles } from "@/lib/seo/sitemap";

// The sitemap index (/sitemaps/pages.xml and /sitemaps/stories-<n>.xml, see
// lib/seo/sitemap.ts). On Vercel this path keeps its build-time copy, so it names
// spare story files too; a build without the API lists the pages sitemap and spares.
export const revalidate = 86400;

export async function GET() {
  const stories = await getClusterIndex().catch((err) => {
    if (isBuildPhase()) return [];
    throw err;
  });
  return new Response(buildSitemapIndexXml(sitemapFiles(stories.length)), {
    headers: { "Content-Type": "application/xml" },
  });
}
