// Server component: fetches the story so crawlers get the full summary,
// takeaways and sources in the HTML. Interaction lives in ClusterPageClient.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getCluster, getDigest, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiCluster } from "@/lib/api/types";
import { newsArticleJsonLd } from "@/lib/seo/json-ld";
import { storyPath } from "@/lib/seo/site";
import { ClusterPageClient } from "./cluster-page-client";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await getCluster(id);
    const title = data.title?.en ?? "";
    const description = (data.summary?.en ?? "").slice(0, 160);
    return {
      title,
      description,
      alternates: { canonical: storyPath(id) },
      openGraph: { type: "article", title, description, url: storyPath(id) },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return {};
  }
}

export function generateStaticParams() {
  return [];
}

/** Where this story sits in today's digest: the story after it, or none if it's last / not in the digest. */
export type TodayPosition = { next: ApiCluster | null; inDigest: boolean };

async function todayPosition(id: string): Promise<TodayPosition | null> {
  try {
    const digest = await getDigest();
    // The home page reads the featured story first, then the rest of the list
    const order = digest.featured
      ? [digest.featured, ...digest.topClusters.filter((c) => c.id !== digest.featured?.id)]
      : digest.topClusters;
    const i = order.findIndex((c) => c.id === id);
    return i < 0 ? { next: null, inDigest: false } : { next: order[i + 1] ?? null, inDigest: true };
  } catch {
    return null;
  }
}

type LoadedStory = { cluster: ApiCluster; related: ApiCluster[]; today: TodayPosition | null };

async function loadStory(id: string): Promise<LoadedStory | null> {
  let cluster: ApiCluster;
  try {
    cluster = await getCluster(id);
  } catch (err) {
    if (isMissing(err)) notFound();
    // Build: render the client-side fallback. Runtime: rethrow so a failed
    // refresh keeps serving the last good page.
    if (isBuildPhase()) return null;
    throw err;
  }
  const [related, today] = await Promise.all([
    Promise.all(cluster.relatedClusterIds.map((rid) => getCluster(rid).catch(() => null))),
    todayPosition(id),
  ]);
  return { cluster, related: related.filter((c): c is ApiCluster => c !== null), today };
}

export default async function ClusterPage({ params }: Props) {
  const { id } = await params;
  const story = await loadStory(id);
  return (
    <>
      {story ? <JsonLd data={newsArticleJsonLd(story.cluster)} /> : null}
      <ClusterPageClient key={id} initial={story} />
    </>
  );
}
