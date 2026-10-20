import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { fetchRadar, fetchRadarAnswers } from "@/lib/api";
import type { ApiRadar } from "@/lib/api/types";
import { withRadarDefaults } from "@/lib/utils/radar";
import { layoutRadar } from "@/lib/utils/radar-layout";
import { RadarPageClient } from "@/app/[lang]/radar/radar-page-client";
import { asLang, sectionMetadata } from "@/lib/seo/copy";

// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sectionMetadata("radar", "/radar", asLang((await params).lang));
}

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
