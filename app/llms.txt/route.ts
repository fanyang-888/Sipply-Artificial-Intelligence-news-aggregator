import { getDigest } from "@/lib/api/server";
import type { ApiDigest } from "@/lib/api/types";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";

// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

export async function GET() {
  let digest: ApiDigest | null = null;
  try {
    digest = await getDigest();
  } catch {
    // Still describe the site without today's stories
  }
  return new Response(buildLlmsTxt(digest), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
