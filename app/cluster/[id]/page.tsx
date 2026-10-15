// Server component: fetches the story so crawlers get the full summary,
// takeaways and sources in the HTML. Interaction lives in ClusterPageClient.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getCluster, isBuildPhase, isMissing } from "@/lib/api/server";
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

async function loadStory(id: string): Promise<{ cluster: ApiCluster; related: ApiCluster[] } | null> {
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
  const related = await Promise.all(
    cluster.relatedClusterIds.map((rid) => getCluster(rid).catch(() => null)),
  );
  return { cluster, related: related.filter((c): c is ApiCluster => c !== null) };
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
