import { getClusterBySlug, isMissing } from "@/lib/api/server";
import { storyMarkdown } from "@/lib/seo/markdown";
import { storyPath, storyUrl } from "@/lib/seo/site";

// /story/<slug>.md, the story as markdown (English, then Chinese). The proxy leaves paths with an
// extension alone, so this route answers them; story pages themselves are app/[lang]/story/[slug].
// Rebuilt when the pipeline marks the story changed (lib/api/cache-policy.ts); a week at most
export const revalidate = 604800;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!file.endsWith(".md")) return new Response("Not found", { status: 404 });
  const slug = file.slice(0, -3);
  try {
    const story = await getClusterBySlug(slug);
    if (story.slug && story.slug !== slug) {
      return Response.redirect(new URL(`${storyPath(story)}.md`, "https://www.sipply.dev"), 308);
    }
    return new Response(storyMarkdown(story), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        // A copy of the page for machines: the HTML page is the one to index and cite
        Link: `<${storyUrl(story)}>; rel="canonical"`,
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    if (isMissing(err)) return new Response("Story not found", { status: 404 });
    return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "60" } });
  }
}
