import type { Metadata } from "next";
import { getTopics, isBuildPhase } from "@/lib/api/server";
import type { ApiTopicSummary } from "@/lib/api/types";
import { TopicsIndex } from "@/components/hubs/hub-pages";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Companies & models",
  description: "Every Sipply story about OpenAI, Anthropic, Google & Gemini, Meta, DeepSeek and other AI companies and model families, one page each.",
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
  return <TopicsIndex topics={await load()} />;
}
