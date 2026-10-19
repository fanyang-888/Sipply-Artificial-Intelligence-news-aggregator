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
import type { Lang } from "@/lib/i18n";
import { localePath, pageAlternates } from "@/lib/i18n/routing";
import { asLang, sectionCopy } from "@/lib/seo/copy";
import { storyPath } from "@/lib/seo/site";
import { positionInDigest, type TodayPosition } from "@/lib/utils/today-position";
import { ClusterPageClient } from "./cluster-page-client";

type Props = {
  params: Promise<{ lang: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lang: raw } = await params;
  const lang = asLang(raw);
  try {
    const data = await getClusterBySlug(slug);
    const zh = lang === "zh";
    const title = (zh && data.title?.zh) || data.title?.en || "";
    const description = ((zh && data.summary?.zh) || data.summary?.en || "").slice(0, 160);
    const alternates = pageAlternates(storyPath(data), lang);
    return {
      title,
      description,
      alternates,
      openGraph: {
        type: "article",
        siteName: "Sipply",
        locale: zh ? "zh_CN" : "en_US",
        title,
        description,
        url: alternates.canonical,
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

async function loadStory(slug: string, lang: Lang): Promise<LoadedStory | null> {
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
  if (cluster.slug && cluster.slug !== slug) permanentRedirect(localePath(storyPath(cluster), lang));
  const [related, today] = await Promise.all([
    Promise.all(cluster.relatedClusterIds.map((rid) => getCluster(rid).catch(() => null))),
    todayPosition(cluster.id),
  ]);
  return { cluster, related: related.filter((c): c is ApiCluster => c !== null), today };
}

export default async function StoryPage({ params }: Props) {
  const { slug, lang: raw } = await params;
  const lang = asLang(raw);
  const story = await loadStory(slug, lang);
  return (
    <>
      {story ? <JsonLd data={newsArticleJsonLd(story.cluster, lang)} /> : null}
      {story ? (
        <JsonLd
          data={breadcrumbJsonLd(
            [
              { name: "Sipply", path: "/" },
              { name: sectionCopy("archive", lang).title, path: "/archive" },
              { name: (lang === "zh" && story.cluster.title.zh) || story.cluster.title.en, path: storyPath(story.cluster) },
            ],
            lang,
          )}
        />
      ) : null}
      <ClusterPageClient key={slug} slug={slug} initial={story} />
    </>
  );
}
