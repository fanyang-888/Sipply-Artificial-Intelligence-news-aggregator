// Server component: renders today's global digest into the HTML (crawlers and
// first paint), then HomePageClient re-ranks it for the reader.

import type { Metadata } from "next";
import { JsonLd } from "@/components/shared/json-ld";
import { getDigest, getLastPipelineRunAt } from "@/lib/api/server";
import type { ApiDigest } from "@/lib/api/types";
import { digestItemListJsonLd } from "@/lib/seo/json-ld";
import { HomePageClient } from "@/app/home-page-client";

// The pipeline runs 4× a day; re-render at most every 5 minutes
export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

async function loadDigest(): Promise<ApiDigest | null> {
  try {
    return await getDigest();
  } catch {
    // The client fetches the digest itself when this is null
    return null;
  }
}

export default async function HomePage() {
  const [digest, pipelineUpdatedAt] = await Promise.all([
    loadDigest(),
    // Only for the "Pipeline updated" line, which is hidden when this fails
    getLastPipelineRunAt().catch(() => null),
  ]);
  return (
    <>
      {digest ? <JsonLd data={digestItemListJsonLd(digest)} /> : null}
      <HomePageClient initialDigest={digest} pipelineUpdatedAt={pipelineUpdatedAt} />
    </>
  );
}
