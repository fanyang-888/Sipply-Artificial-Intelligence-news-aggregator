// Server component: fetches the story so crawlers get the full summary,
// takeaways and sources in the HTML. Interaction lives in ClusterPageClient.
// The address is /story/<slug>, the story's permanent keyword URL; the old
// /cluster/<id> redirects here (app/cluster/[id]/route.ts).

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getCluster, getClusterBySlug, getDigest, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiCluster } from "@/lib/api/types";
import { breadcrumbJsonLd, newsArticleJsonLd } from "@/lib/seo/json-ld";
import { storyPath } from "@/lib/seo/site";
import { positionInDigest, type TodayPosition } from "@/lib/utils/today-position";
import { ClusterPageClient } from "./cluster-page-client";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await getClusterBySlug(slug);
    const title = data.title?.en ?? "";
    const description = (data.summary?.en ?? "").slice(0, 160);
    const path = storyPath(data);
    return {
      title,
      description,
      alternates: { canonical: path },
      openGraph: {
        type: "article",
        siteName: "Sipply",
        title,
        description,
        url: path,
        publishedTime: data.firstSeenAt ?? undefined,
        modifiedTime: data.lastSeenAt ?? undefined,
        section: data.topicTag ?? undefined,
        tags: data.tags?.length ? data.tags : undefined,
      },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return {};
  }
}

export function generateStaticParams() {
  return [];
}

async function todayPosition(id: string): Promise<TodayPosition | null> {
  try {
    return positionInDigest(await getDigest(), id);
  } catch {
    return null;
  }
}

type LoadedStory = { cluster: ApiCluster; related: ApiCluster[]; today: TodayPosition | null };

async function loadStory(slug: string): Promise<LoadedStory | null> {
  let cluster: ApiCluster;
  try {
    cluster = await getClusterBySlug(slug);
  } catch (err) {
    if (isMissing(err)) notFound();
    // Build: render the client-side fallback. Runtime: rethrow so a failed
    // refresh keeps serving the last good page.
    if (isBuildPhase()) return null;
    throw err;
  }
  // Old or mistyped words for a real story: send them to its one address
  if (cluster.slug && cluster.slug !== slug) permanentRedirect(storyPath(cluster));
  const [related, today] = await Promise.all([
    Promise.all(cluster.relatedClusterIds.map((rid) => getCluster(rid).catch(() => null))),
    todayPosition(cluster.id),
  ]);
  return { cluster, related: related.filter((c): c is ApiCluster => c !== null), today };
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const story = await loadStory(slug);
  return (
    <>
      {story ? <JsonLd data={newsArticleJsonLd(story.cluster)} /> : null}
      {story ? (
        <JsonLd
          data={breadcrumbJsonLd([
            { name: "Sipply", path: "/" },
            { name: "Archive", path: "/archive" },
            { name: story.cluster.title.en, path: storyPath(story.cluster) },
          ])}
        />
      ) : null}
      <ClusterPageClient key={slug} slug={slug} initial={story} />
    </>
  );
}
