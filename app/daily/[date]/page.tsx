import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getDay, getDays, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiDayDetail, ApiDaySummary } from "@/lib/api/types";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { dayTitle, formatDay, isDayKey, neighbourDays } from "@/lib/utils/days";
import { DayPage } from "@/components/hubs/hub-pages";

export const revalidate = 300;

type Props = { params: Promise<{ date: string }> };

/** "14 AI stories from October 18, 2026: Replit drops Anthropic; …" */
function describe(day: ApiDayDetail): string {
  const date = formatDay(day.date, "en", { weekday: false });
  const heads = day.headlines.map((h) => h.title).join("; ");
  return `${day.storyCount} AI ${day.storyCount === 1 ? "story" : "stories"} from ${date}${heads ? `: ${heads}.` : "."}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  if (!isDayKey(date)) return {};
  try {
    const data = await getDay(date);
    const title = dayTitle(date, data.storyCount);
    return {
      title,
      description: describe(data),
      alternates: { canonical: `/daily/${date}` },
      openGraph: { siteName: "Sipply", type: "website", title, description: describe(data), url: `/daily/${date}` },
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
  const { date } = await params;
  if (!isDayKey(date)) notFound();
  const loaded = await load(date);
  const { newer, older } = loaded ? neighbourDays(loaded.days, date) : { newer: null, older: null };
  const name = `AI news, ${formatDay(date, "en", { weekday: false })}`;
  return (
    <>
      {loaded ? (
        <JsonLd
          data={breadcrumbJsonLd([
            { name: "Sipply", path: "/" },
            { name: "AI news by day", path: "/daily" },
            { name, path: `/daily/${date}` },
          ])}
        />
      ) : null}
      {loaded ? (
        <JsonLd
          data={collectionPageJsonLd({
            name,
            description: describe(loaded.data),
            path: `/daily/${date}`,
            stories: loaded.data.stories,
            dateModified: loaded.data.stories.map((s) => s.lastSeenAt).filter(Boolean).sort().at(-1),
          })}
        />
      ) : null}
      <DayPage day={loaded?.data ?? null} newer={newer} older={older} />
    </>
  );
}
