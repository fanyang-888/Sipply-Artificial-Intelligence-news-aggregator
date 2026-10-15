import type { Cluster } from "@/types/cluster";

/**
 * The story's most relevant source article (the API sorts articles by
 * relevance), for a direct "original" link; null when there is no usable URL.
 */
export function primarySource(cluster: Pick<Cluster, "articles">): { url: string; name: string; title: string } | null {
  const article = (cluster.articles ?? []).find((a) => /^https?:\/\//i.test(a.url ?? ""));
  if (!article) return null;
  let host = "";
  try {
    host = new URL(article.url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return { url: article.url, name: article.organizationName || host, title: article.title };
}
