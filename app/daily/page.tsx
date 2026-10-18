import type { Metadata } from "next";
import { getDays, isBuildPhase } from "@/lib/api/server";
import type { ApiDaySummary } from "@/lib/api/types";
import { formatDay, utcDayKey } from "@/lib/utils/days";
import { DaysIndex } from "@/components/hubs/hub-pages";
import { JsonLd } from "@/components/shared/json-ld";
import { pageListJsonLd } from "@/lib/seo/json-ld";

export const revalidate = 300;

const DESCRIPTION = "Every AI story Sipply covered, one page per day: what happened first, then papers and newsletters.";

export const metadata: Metadata = {
  title: "AI news by day",
  description: DESCRIPTION,
  alternates: { canonical: "/daily" },
};

async function load(): Promise<ApiDaySummary[] | null> {
  try {
    return await getDays();
  } catch (err) {
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function DailyPage() {
  const days = await load();
  return (
    <>
      {days ? (
        <JsonLd
          data={pageListJsonLd({
            name: "AI news by day",
            description: DESCRIPTION,
            path: "/daily",
            items: days.map((d) => ({ name: `AI news, ${formatDay(d.date, "en", { weekday: false })}`, path: `/daily/${d.date}` })),
          })}
        />
      ) : null}
      <DaysIndex days={days} today={utcDayKey(new Date())} />
    </>
  );
}
