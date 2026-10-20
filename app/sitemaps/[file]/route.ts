import { getClusterIndex, getDays, getTopics, getWeeks } from "@/lib/api/server";
import { buildSitemapXml, pageEntries, storyEntries } from "@/lib/seo/sitemap";

// /sitemaps/pages.xml and /sitemaps/stories-<n>.xml, listed by /sitemap.xml.
// Cached, and rebuilt when the pipeline marks a run's data stale ("run" tag); a day
// at most. A failed rebuild keeps the last good copy.
export const revalidate = 86400;

export function generateStaticParams() {
  return [{ file: "pages.xml" }];
}

const STORIES = /^stories-(\d{1,4})\.xml$/;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const xml = (body: string) => new Response(body, { headers: { "Content-Type": "application/xml" } });
  if (file === "pages.xml") {
    // Hub lists are extras each: one failing shouldn't cost the others
    const [topics, weeks, days] = await Promise.all([
      getTopics().catch(() => []),
      getWeeks().catch(() => []),
      getDays().catch(() => []),
    ]);
    return xml(buildSitemapXml(pageEntries({ topics, weeks, days }, new Date())));
  }
  const m = STORIES.exec(file);
  if (!m) return new Response("Not found", { status: 404 });
  // A spare file the index names before stories reach it: a valid, empty sitemap
  return xml(buildSitemapXml(storyEntries(await getClusterIndex(), Number(m[1]))));
}
