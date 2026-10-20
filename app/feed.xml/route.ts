import { getFeed, isBuildPhase } from "@/lib/api/server";
import { buildRss } from "@/lib/seo/feeds";

// Cached, and rebuilt when the pipeline marks a run's data stale ("run" tag,
// lib/api/cache-policy.ts); a day at most. Like the sitemap: a failed rebuild keeps
// the last good copy, a build without the API makes an empty one until the next run.
export const revalidate = 86400;

/** RSS 2.0: the 50 newest stories, with their summaries and sources. */
export async function GET() {
  try {
    const items = await getFeed(50);
    return new Response(buildRss(items), {
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  } catch (err) {
    if (!isBuildPhase()) throw err;
    return new Response(buildRss([]), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
  }
}
