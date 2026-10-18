import { getFeed } from "@/lib/api/server";
import { buildNewsSitemap } from "@/lib/seo/feeds";

// Per request, like the sitemap; the story list is cached for 5 minutes in getFeed
export const dynamic = "force-dynamic";

/** A Google News sitemap: stories from the last 48 hours (at most 200 by the feed's limit). */
export async function GET() {
  try {
    const items = await getFeed(200);
    return new Response(buildNewsSitemap(items), {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "300" } });
  }
}
