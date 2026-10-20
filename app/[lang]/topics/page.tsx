import type { Metadata } from "next";
import { getTopics, isBuildPhase } from "@/lib/api/server";
import type { ApiTopicSummary } from "@/lib/api/types";
import { TopicsIndex } from "@/components/hubs/hub-pages";
import { JsonLd } from "@/components/shared/json-ld";
import { asLang, sectionCopy, sectionMetadata } from "@/lib/seo/copy";
import { pageListJsonLd } from "@/lib/seo/json-ld";

// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sectionMetadata("topics", "/topics", asLang((await params).lang));
}

async function load(): Promise<ApiTopicSummary[] | null> {
  try {
    return await getTopics();
  } catch (err) {
    // Build: the API may not be deployed yet. Runtime: keep serving the last good page.
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function TopicsPage({ params }: Props) {
  const lang = asLang((await params).lang);
  const copy = sectionCopy("topics", lang);
  const topics = await load();
  return (
    <>
      {topics ? (
        <JsonLd
          data={pageListJsonLd({
            name: copy.title,
            description: copy.description,
            path: "/topics",
            lang,
            items: topics.map((t) => ({ name: t.name, path: `/topics/${t.slug}` })),
          })}
        />
      ) : null}
      <TopicsIndex topics={topics} />
    </>
  );
}
