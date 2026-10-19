import type { Metadata } from "next";
import { getWeeks, isBuildPhase } from "@/lib/api/server";
import type { ApiWeekSummary } from "@/lib/api/types";
import { formatWeekRange, isoWeekKey } from "@/lib/utils/weeks";
import { WeeksIndex } from "@/components/hubs/hub-pages";
import { JsonLd } from "@/components/shared/json-ld";
import { asLang, sectionCopy, sectionMetadata } from "@/lib/seo/copy";
import { pageListJsonLd } from "@/lib/seo/json-ld";

export const revalidate = 300;

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sectionMetadata("weekly", "/weekly", asLang((await params).lang));
}

async function load(): Promise<ApiWeekSummary[] | null> {
  try {
    return await getWeeks();
  } catch (err) {
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function WeeklyPage({ params }: Props) {
  const lang = asLang((await params).lang);
  const copy = sectionCopy("weekly", lang);
  const weeks = await load();
  return (
    <>
      {weeks ? (
        <JsonLd
          data={pageListJsonLd({
            name: copy.title,
            description: copy.description,
            path: "/weekly",
            lang,
            items: weeks.map((w) => ({
              name: lang === "zh" ? `AI 新闻，${formatWeekRange(w.start, w.end, "zh")}` : `AI news, ${formatWeekRange(w.start, w.end, "en")}`,
              path: `/weekly/${w.week}`,
            })),
          })}
        />
      ) : null}
      <WeeksIndex weeks={weeks} currentWeek={isoWeekKey(new Date())} />
    </>
  );
}
