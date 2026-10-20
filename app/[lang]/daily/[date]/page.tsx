import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getDay, getDays, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiDayDetail, ApiDaySummary } from "@/lib/api/types";
import type { Lang } from "@/lib/i18n";
import { pageAlternates } from "@/lib/i18n/routing";
import { asLang, sectionCopy } from "@/lib/seo/copy";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { dayTitle, formatDay, isDayKey, neighbourDays } from "@/lib/utils/days";
import { DayPage } from "@/components/hubs/hub-pages";

// Rebuilt when the pipeline marks a run's data stale (lib/api/cache-policy.ts); a day at most
export const revalidate = 86400;

type Props = { params: Promise<{ lang: string; date: string }> };

/** "14 AI stories from October 18, 2026: Replit drops Anthropic; …" */
function describe(day: ApiDayDetail, lang: Lang): string {
  const date = formatDay(day.date, lang, { weekday: false });
  if (lang === "zh") {
    const heads = day.headlines.map((h) => h.titleZh || h.title).join("；");
    return `${date}的 ${day.storyCount} 篇 AI 报道${heads ? `：${heads}。` : "。"}`;
  }
  const heads = day.headlines.map((h) => h.title).join("; ");
  return `${day.storyCount} AI ${day.storyCount === 1 ? "story" : "stories"} from ${date}${heads ? `: ${heads}.` : "."}`;
}

function pageName(date: string, lang: Lang): string {
  return lang === "zh" ? `${formatDay(date, "zh", { weekday: false })} AI 新闻` : `AI news, ${formatDay(date, "en", { weekday: false })}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date, lang: raw } = await params;
  const lang = asLang(raw);
  if (!isDayKey(date)) return {};
  try {
    const data = await getDay(date);
    const title = dayTitle(date, data.storyCount, new Date(), lang);
    const alternates = pageAlternates(`/daily/${date}`, lang);
    return {
      title,
      description: describe(data, lang),
      alternates,
      openGraph: { siteName: "Sipply", type: "website", title, description: describe(data, lang), url: alternates.canonical },
    };
  } catch {
    return {};
  }
}

export function generateStaticParams() {
  return [];
}

async function load(date: string): Promise<{ data: ApiDayDetail; days: ApiDaySummary[] } | null> {
  try {
    const [data, days] = await Promise.all([getDay(date), getDays().catch(() => [])]);
    return { data, days };
  } catch (err) {
    // 404 = no stories that day; 422 = not a day
    if (isMissing(err)) notFound();
    if (isBuildPhase()) return null;
    throw err;
  }
}

export default async function DayRoute({ params }: Props) {
  const { date, lang: raw } = await params;
  const lang = asLang(raw);
  if (!isDayKey(date)) notFound();
  const loaded = await load(date);
  const { newer, older } = loaded ? neighbourDays(loaded.days, date) : { newer: null, older: null };
  const name = pageName(date, lang);
  return (
    <>
      {loaded ? (
        <JsonLd
          data={breadcrumbJsonLd(
            [
              { name: "Sipply", path: "/" },
              { name: sectionCopy("daily", lang).title, path: "/daily" },
              { name, path: `/daily/${date}` },
            ],
            lang,
          )}
        />
      ) : null}
      {loaded ? (
        <JsonLd
          data={collectionPageJsonLd({
            name,
            description: describe(loaded.data, lang),
            path: `/daily/${date}`,
            lang,
            stories: loaded.data.stories,
            dateModified: loaded.data.stories.map((s) => s.lastSeenAt).filter(Boolean).sort().at(-1),
          })}
        />
      ) : null}
      <DayPage day={loaded?.data ?? null} newer={newer} older={older} />
    </>
  );
}
