import { getFeed, isBuildPhase } from "@/lib/api/server";
import { buildNewsSitemap } from "@/lib/seo/feeds";

// Cached, and rebuilt when the pipeline marks a run's data stale ("run" tag,
// lib/api/cache-policy.ts); a day at most. Like the sitemap: a failed rebuild keeps
// the last good copy, a build without the API makes an empty one until the next run.
export const revalidate = 86400;

/** A Google News sitemap: stories from the last 48 hours (at most 200 by the feed's limit). */
export async function GET() {
  try {
    const items = await getFeed(200);
    return new Response(buildNewsSitemap(items), {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (err) {
    if (!isBuildPhase()) throw err;
    return new Response(buildNewsSitemap([]), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }
}
