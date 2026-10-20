import type { Metadata } from "next";
import { getDays, isBuildPhase } from "@/lib/api/server";
import type { ApiDaySummary } from "@/lib/api/types";
import { formatDay, utcDayKey } from "@/lib/utils/days";
import { DaysIndex } from "@/components/hubs/hub-pages";
import { JsonLd } from "@/components/shared/json-ld";
import { asLang, sectionCopy, sectionMetadata } from "@/lib/seo/copy";
import { pageListJsonLd } from "@/lib/seo/json-ld";

// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sectionMetadata("daily", "/daily", asLang((await params).lang));
}

async function load(): Promise<ApiDaySummary[] | null> {
  try {
    return await getDays();
  } catch (err) {
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function DailyPage({ params }: Props) {
  const lang = asLang((await params).lang);
  const copy = sectionCopy("daily", lang);
  const days = await load();
  return (
    <>
      {days ? (
        <JsonLd
          data={pageListJsonLd({
            name: copy.title,
            description: copy.description,
            lang,
            path: "/daily",
            items: days.map((d) => ({
              name: lang === "zh" ? `${formatDay(d.date, "zh", { weekday: false })} AI 新闻` : `AI news, ${formatDay(d.date, "en", { weekday: false })}`,
              path: `/daily/${d.date}`,
            })),
          })}
        />
      ) : null}
      <DaysIndex days={days} today={utcDayKey(new Date())} />
    </>
  );
}
