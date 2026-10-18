import { getFeed } from "@/lib/api/server";
import { buildRss } from "@/lib/seo/feeds";

// Per request, like the sitemap: a prerendered copy made during a deploy never refreshed.
// The story list itself stays cached for 5 minutes in getFeed's fetch cache.
export const dynamic = "force-dynamic";

/** RSS 2.0: the 50 newest stories, with their summaries and sources. */
export async function GET() {
  try {
    const items = await getFeed(50);
    return new Response(buildRss(items), {
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  } catch {
    // Readers and crawlers keep the copy they have instead of an empty feed
    return new Response("Feed temporarily unavailable", { status: 503, headers: { "Retry-After": "300" } });
  }
}
