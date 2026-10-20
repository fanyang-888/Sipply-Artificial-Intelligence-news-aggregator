import { getFeed } from "@/lib/api/server";
import { llmsFullTxt } from "@/lib/seo/markdown";

// The newest stories in full, for LLMs (https://llmstxt.org); follows the feed's cache
// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

export async function GET() {
  try {
    const items = await getFeed(50);
    return new Response(llmsFullTxt(items), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch {
    return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "300" } });
  }
}
