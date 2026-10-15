// Server component: renders today's global digest into the HTML (crawlers and
// first paint), then HomePageClient re-ranks it for the reader.

import type { Metadata } from "next";
import { JsonLd } from "@/components/shared/json-ld";
import { fetchRadar } from "@/lib/api";
import { getDigest, getLastPipelineRunAt, getWeeks } from "@/lib/api/server";
import type { ApiDigest, ApiRadar } from "@/lib/api/types";
import { digestItemListJsonLd } from "@/lib/seo/json-ld";
import { radarOrder, withRadarDefaults } from "@/lib/utils/radar";
import { HomePageClient } from "@/app/home-page-client";

// The pipeline runs 4× a day; re-render at most every 5 minutes
export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Radar topics the home page previews (panel 03). */
const RADAR_PREVIEW = 3;

async function loadDigest(): Promise<ApiDigest | null> {
  try {
    return await getDigest();
  } catch {
    // The client fetches the digest itself when this is null
    return null;
  }
}

async function loadRadar(): Promise<ApiRadar | null> {
  try {
    return withRadarDefaults(await fetchRadar(12));
  } catch {
    return null; // panel 03 is hidden
  }
}

export default async function HomePage() {
  const [digest, pipelineUpdatedAt, radar, weeks] = await Promise.all([
    loadDigest(),
    // Only for the "Updated" line, which is hidden when this fails
    getLastPipelineRunAt().catch(() => null),
    loadRadar(),
    getWeeks().catch(() => null),
  ]);
  const radarTopics = radar ? radarOrder(radar.topics).slice(0, RADAR_PREVIEW) : [];
  const radarSignals = radar ? radar.sources.reduce((sum, s) => sum + s.signalCount, 0) : 0;
  // The three busiest community platforms, named in the panel's subtitle (news is always mentioned)
  const radarSourceLabels = (radar?.sources ?? [])
    .filter((s) => s.active && s.signalCount > 0 && s.key !== "news")
    .sort((a, b) => b.signalCount - a.signalCount)
    .slice(0, 3)
    .map((s) => s.label);
  return (
    <>
      {digest ? <JsonLd data={digestItemListJsonLd(digest)} /> : null}
      <HomePageClient
        initialDigest={digest}
        pipelineUpdatedAt={pipelineUpdatedAt}
        radarTopics={radarTopics}
        radarSignals={radarSignals}
        radarSourceLabels={radarSourceLabels}
        radarWindowDays={radar?.windowDays ?? 14}
        week={weeks?.[0] ?? null}
      />
    </>
  );
}
