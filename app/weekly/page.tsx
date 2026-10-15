import type { Metadata } from "next";
import { getWeeks, isBuildPhase } from "@/lib/api/server";
import type { ApiWeekSummary } from "@/lib/api/types";
import { formatWeekRange, isoWeekKey } from "@/lib/utils/weeks";
import { WeeksIndex } from "@/components/hubs/hub-pages";
import { JsonLd } from "@/components/shared/json-ld";
import { pageListJsonLd } from "@/lib/seo/json-ld";

export const revalidate = 300;

const DESCRIPTION = "The week's top AI stories, by category and company, every week.";

export const metadata: Metadata = {
  title: "Weekly recaps",
  description: DESCRIPTION,
  alternates: { canonical: "/weekly" },
};

async function load(): Promise<ApiWeekSummary[] | null> {
  try {
    return await getWeeks();
  } catch (err) {
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function WeeklyPage() {
  const weeks = await load();
  return (
    <>
      {weeks ? (
        <JsonLd
          data={pageListJsonLd({
            name: "Weekly recaps",
            description: DESCRIPTION,
            path: "/weekly",
            items: weeks.map((w) => ({ name: `AI news, ${formatWeekRange(w.start, w.end, "en")}`, path: `/weekly/${w.week}` })),
          })}
        />
      ) : null}
      <WeeksIndex weeks={weeks} currentWeek={isoWeekKey(new Date())} />
    </>
  );
}
