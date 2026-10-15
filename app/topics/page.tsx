import type { Metadata } from "next";
import { getTopics, isBuildPhase } from "@/lib/api/server";
import type { ApiTopicSummary } from "@/lib/api/types";
import { TopicsIndex } from "@/components/hubs/hub-pages";
import { JsonLd } from "@/components/shared/json-ld";
import { pageListJsonLd } from "@/lib/seo/json-ld";

export const revalidate = 300;

const DESCRIPTION =
  "Every Sipply story about OpenAI, Anthropic, Google & Gemini, Meta, DeepSeek and other AI companies and model families, one page each.";

export const metadata: Metadata = {
  title: "Companies & models",
  description: DESCRIPTION,
  alternates: { canonical: "/topics" },
};

async function load(): Promise<ApiTopicSummary[] | null> {
  try {
    return await getTopics();
  } catch (err) {
    // Build: the API may not be deployed yet. Runtime: keep serving the last good page.
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function TopicsPage() {
  const topics = await load();
  return (
    <>
      {topics ? (
        <JsonLd
          data={pageListJsonLd({
            name: "Companies & models",
            description: DESCRIPTION,
            path: "/topics",
            items: topics.map((t) => ({ name: t.name, path: `/topics/${t.slug}` })),
          })}
        />
      ) : null}
      <TopicsIndex topics={topics} />
    </>
  );
}
