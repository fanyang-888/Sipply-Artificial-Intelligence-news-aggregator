import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { RUN_TAG, isCacheTag } from "@/lib/api/cache-policy";

// POST {"tags": [...]} with "Authorization: Bearer <REVALIDATE_SECRET>": the pipeline, right
// after a successful run, marks the cached data that run changed (backend/app/services/
// site_revalidate.py). Pages are cached for long (lib/api/cache-policy.ts), so only those
// pages are rebuilt, on their next visit.

const MAX_TAGS = 2000;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  if (!secret) return Response.json({ error: "not configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = body?.tags;
  if (!Array.isArray(tags) || tags.length > MAX_TAGS || !tags.every(isCacheTag)) {
    return Response.json({ error: "tags must be a list of known cache tags" }, { status: 400 });
  }
  // Expire at once rather than serve stale first: search engines told by IndexNow come
  // straight after, and should get the new page
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  // On Vercel the sitemap, a metadata route, isn't tied to its fetches' tags (after the
  // 2026-10-20 20:02 UTC run it was still the 18:09 copy while feed.xml was rebuilt)
  if (tags.includes(RUN_TAG)) revalidatePath("/sitemap.xml");
  return Response.json({ revalidated: tags.length });
}
