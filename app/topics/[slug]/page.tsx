import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getTopic, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiTopicDetail } from "@/lib/api/types";
import { collectionPageJsonLd } from "@/lib/seo/json-ld";
import { TopicPage } from "@/components/hubs/hub-pages";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

function describe(topic: ApiTopicDetail): string {
  return `Every Sipply story about ${topic.name}, newest first: ${topic.storyCount} in the last 30 days, ${topic.totalStories} in total.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const topic = await getTopic(slug);
    const title = `${topic.name}: the latest AI news`;
    return {
      title,
      description: describe(topic),
      alternates: { canonical: `/topics/${slug}` },
      openGraph: { siteName: "Sipply", title, description: describe(topic), url: `/topics/${slug}` },
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
  const { slug } = await params;
  const topic = await load(slug);
  return (
    <>
      {topic ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: `${topic.name}: the latest AI news`,
            description: describe(topic),
            path: `/topics/${slug}`,
            stories: topic.stories,
            dateModified: topic.latestAt,
          })}
        />
      ) : null}
      <TopicPage topic={topic} />
    </>
  );
}
