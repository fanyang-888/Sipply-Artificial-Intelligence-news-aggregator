import { getCluster, isMissing } from "@/lib/api/server";
import { storyPath } from "@/lib/seo/site";

// The old story address. A route handler, not a page: it answers 308 before anything
// streams, so search engines move the old URL's standing to /story/<slug> and readers
// with old links land on the story. The share image beside it (opengraph-image.tsx)
// stays, for cards already posted.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const story = await getCluster(id);
    // An API without slugs would send this route back to itself
    if (!story.slug) return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "60" } });
    return Response.redirect(new URL(storyPath(story), request.url), 308);
  } catch (err) {
    if (isMissing(err)) return new Response("Story not found", { status: 404 });
    return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "60" } });
  }
}
