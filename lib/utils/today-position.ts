import type { ApiCluster, ApiDigest } from "@/lib/api/types";

/** Where a story sits in today's digest: the story after it, or none if it's last / not in the digest. */
export type TodayPosition = { next: ApiCluster | null; inDigest: boolean };

/** Today's reading order as the home page shows it: the featured story first, then the rest. */
export function digestOrder(digest: Pick<ApiDigest, "featured" | "topClusters">): ApiCluster[] {
  const featured = digest.featured;
  return featured ? [featured, ...digest.topClusters.filter((c) => c.id !== featured.id)] : digest.topClusters;
}

export function positionInDigest(digest: Pick<ApiDigest, "featured" | "topClusters">, id: string): TodayPosition {
  const order = digestOrder(digest);
  const i = order.findIndex((c) => c.id === id);
  return i < 0 ? { next: null, inDigest: false } : { next: order[i + 1] ?? null, inDigest: true };
}
