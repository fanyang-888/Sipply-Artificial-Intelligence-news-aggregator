import type { Article } from "@/types/article";
import type { Cluster } from "@/types/cluster";
import { flattenLocalized } from "@/lib/utils/localized-string";

const WORDS_PER_MINUTE = 200;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Rough digest read time from cluster narrative fields. */
export function estimateClusterReadMinutes(cluster: Cluster): number {
  const blob = [
    cluster.summary,
    cluster.subtitle ?? "",
    ...cluster.takeaways,
    cluster.whyItMatters,
    cluster.audience.pm,
    cluster.audience.developer,
    cluster.audience.studentJobSeeker,
  ]
    .map(flattenLocalized)
    .join(" ");
  const words = wordCount(blob);
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export type OutletDiversity = {
  articleCount: number;
  uniqueOutletCount: number;
};

export function getOutletDiversityFromArticles(articles: Article[]): OutletDiversity {
  const ids = new Set(articles.map((a) => a.sourceId));
  return {
    articleCount: articles.length,
    uniqueOutletCount: ids.size,
  };
}
