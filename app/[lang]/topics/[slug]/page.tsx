import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getTopic, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiTopicDetail } from "@/lib/api/types";
import type { Lang } from "@/lib/i18n";
import { pageAlternates } from "@/lib/i18n/routing";
import { asLang, sectionCopy } from "@/lib/seo/copy";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { TopicPage } from "@/components/hubs/hub-pages";

// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string; slug: string }> };

function title(topic: ApiTopicDetail, lang: Lang): string {
  return lang === "zh" ? `${topic.name}：最新 AI 新闻` : `${topic.name}: the latest AI news`;
}

function describe(topic: ApiTopicDetail, lang: Lang): string {
  return lang === "zh"
    ? `Sipply 关于 ${topic.name} 的全部报道，按时间倒序：最近 30 天 ${topic.storyCount} 篇，共 ${topic.totalStories} 篇。`
    : `Every Sipply story about ${topic.name}, newest first: ${topic.storyCount} in the last 30 days, ${topic.totalStories} in total.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lang: raw } = await params;
  const lang = asLang(raw);
  try {
    const topic = await getTopic(slug);
    const alternates = pageAlternates(`/topics/${slug}`, lang);
    return {
      title: title(topic, lang),
      description: describe(topic, lang),
      alternates,
      openGraph: { siteName: "Sipply", title: title(topic, lang), description: describe(topic, lang), url: alternates.canonical },
    };
  } catch {
    return {};
  }
}

export function generateStaticParams() {
  return [];
}

async function load(slug: string): Promise<ApiTopicDetail | null> {
  try {
    return await getTopic(slug);
  } catch (err) {
    if (isMissing(err)) notFound();
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function TopicRoute({ params }: Props) {
  const { slug, lang: raw } = await params;
  const lang = asLang(raw);
  const topic = await load(slug);
  return (
    <>
      {topic ? (
        <JsonLd
          data={breadcrumbJsonLd(
            [
              { name: "Sipply", path: "/" },
              { name: sectionCopy("topics", lang).title, path: "/topics" },
              { name: topic.name, path: `/topics/${slug}` },
            ],
            lang,
          )}
        />
      ) : null}
      {topic ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: title(topic, lang),
            description: describe(topic, lang),
            path: `/topics/${slug}`,
            lang,
            stories: topic.stories,
            dateModified: topic.latestAt,
          })}
        />
      ) : null}
      <TopicPage topic={topic} />
    </>
  );
}
