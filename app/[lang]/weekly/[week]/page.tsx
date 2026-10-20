import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getWeek, getWeeks, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiWeekDetail, ApiWeekSummary } from "@/lib/api/types";
import type { Lang } from "@/lib/i18n";
import { pageAlternates } from "@/lib/i18n/routing";
import { asLang, sectionCopy } from "@/lib/seo/copy";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { formatWeekRange, neighbourWeeks } from "@/lib/utils/weeks";
import { WeekPage } from "@/components/hubs/hub-pages";

// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string; week: string }> };

function title(week: ApiWeekDetail, lang: Lang): string {
  return lang === "zh" ? `AI 新闻，${formatWeekRange(week.start, week.end, "zh")}` : `AI news, ${formatWeekRange(week.start, week.end, "en")}`;
}

function describe(week: ApiWeekDetail, lang: Lang): string {
  const companies = week.topics.slice(0, 4).map((t) => t.name);
  if (lang === "zh") {
    return `${formatWeekRange(week.start, week.end, "zh")}这一周最重要的 AI 报道：共 ${week.storyCount} 篇${companies.length ? `，涉及 ${companies.join("、")}` : ""}。`;
  }
  return `The top AI stories of the week of ${formatWeekRange(week.start, week.end, "en")}: ${week.storyCount} stories${companies.length ? `, with ${companies.join(", ")}` : ""}.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { week, lang: raw } = await params;
  const lang = asLang(raw);
  try {
    const data = await getWeek(week);
    const alternates = pageAlternates(`/weekly/${week}`, lang);
    return {
      title: title(data, lang),
      description: describe(data, lang),
      alternates,
      openGraph: { siteName: "Sipply", title: title(data, lang), description: describe(data, lang), url: alternates.canonical },
    };
  } catch {
    return {};
  }
}

export function generateStaticParams() {
  return [];
}

async function load(week: string): Promise<{ data: ApiWeekDetail; weeks: ApiWeekSummary[] } | null> {
  try {
    const [data, weeks] = await Promise.all([getWeek(week), getWeeks().catch(() => [])]);
    return { data, weeks };
  } catch (err) {
    // 404 = no stories that week; 422 = not a week key
    if (isMissing(err)) notFound();
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function WeekRoute({ params }: Props) {
  const { week, lang: raw } = await params;
  const lang = asLang(raw);
  const loaded = await load(week);
  const { newer, older } = loaded ? neighbourWeeks(loaded.weeks, week) : { newer: null, older: null };
  return (
    <>
      {loaded ? (
        <JsonLd
          data={breadcrumbJsonLd(
            [
              { name: "Sipply", path: "/" },
              { name: sectionCopy("weekly", lang).title, path: "/weekly" },
              { name: title(loaded.data, lang), path: `/weekly/${week}` },
            ],
            lang,
          )}
        />
      ) : null}
      {loaded ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: title(loaded.data, lang),
            description: describe(loaded.data, lang),
            path: `/weekly/${week}`,
            lang,
            stories: loaded.data.stories,
            dateModified: loaded.data.stories[0]?.lastSeenAt,
          })}
        />
      ) : null}
      <WeekPage week={loaded?.data ?? null} newer={newer} older={older} />
    </>
  );
}
