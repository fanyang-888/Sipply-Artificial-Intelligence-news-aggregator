import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { fetchRadar, fetchRadarAnswers } from "@/lib/api";
import type { ApiRadar } from "@/lib/api/types";
import { withRadarDefaults } from "@/lib/utils/radar";
import { layoutRadar } from "@/lib/utils/radar-layout";
import { RadarPageClient } from "@/app/radar/radar-page-client";

// The pipeline refreshes signals 4× a day; re-render at most every 5 minutes
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Trend Radar",
  description:
    "What the AI community is discussing right now: Hacker News, Bluesky, Lobsters, news, YouTube, DEV and new GitHub repos grouped into topics and scored by volume, engagement and velocity.",
  alternates: { canonical: "/radar" },
};

async function loadRadar(): Promise<ApiRadar | null> {
  try {
    return await fetchRadar();
  } catch (err) {
    // At build time the API may be unreachable (or not deployed yet): prerender
    // the "unavailable" state. At runtime, rethrow so a failed revalidation
    // keeps serving the last good page instead of caching an empty one.
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return null;
    throw err;
  }
}

export default async function RadarPage() {
  const [loaded, answers] = await Promise.all([
    loadRadar(),
    // Optional section: hidden when the endpoint fails (or doesn't exist yet during a deploy)
    fetchRadarAnswers().catch(() => null),
  ]);
  const radar = loaded ? withRadarDefaults(loaded) : null;
  // Laid out here, not in the client: server and browser then draw identical coordinates
  const positions = radar ? layoutRadar(radar.topics) : {};
  return <RadarPageClient radar={radar} positions={positions} answers={answers} />;
}
