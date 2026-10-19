import { getFeed } from "@/lib/api/server";
import { llmsFullTxt } from "@/lib/seo/markdown";

// The newest stories in full, for LLMs (https://llmstxt.org); follows the feed's cache
export const revalidate = 300;

export async function GET() {
  try {
    const items = await getFeed(50);
    return new Response(llmsFullTxt(items), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch {
    return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "300" } });
  }
}
