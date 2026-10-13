import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { fetchRadar } from "@/lib/api";
import type { ApiRadar } from "@/lib/api/types";
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
  const radar = await loadRadar();
  return <RadarPageClient radar={radar} />;
}
