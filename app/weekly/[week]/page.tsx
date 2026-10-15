import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/shared/json-ld";
import { getWeek, getWeeks, isBuildPhase, isMissing } from "@/lib/api/server";
import type { ApiWeekDetail, ApiWeekSummary } from "@/lib/api/types";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { formatWeekRange, neighbourWeeks } from "@/lib/utils/weeks";
import { WeekPage } from "@/components/hubs/hub-pages";

export const revalidate = 300;

type Props = { params: Promise<{ week: string }> };

function title(week: ApiWeekDetail): string {
  return `AI news, ${formatWeekRange(week.start, week.end, "en")}`;
}

function describe(week: ApiWeekDetail): string {
  const companies = week.topics.slice(0, 4).map((t) => t.name).join(", ");
  return `The top AI stories of the week of ${formatWeekRange(week.start, week.end, "en")}: ${week.storyCount} stories${companies ? `, with ${companies}` : ""}.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { week } = await params;
  try {
    const data = await getWeek(week);
    return {
      title: title(data),
      description: describe(data),
      alternates: { canonical: `/weekly/${week}` },
      openGraph: { siteName: "Sipply", title: title(data), description: describe(data), url: `/weekly/${week}` },
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
  const { week } = await params;
  const loaded = await load(week);
  const { newer, older } = loaded ? neighbourWeeks(loaded.weeks, week) : { newer: null, older: null };
  return (
    <>
      {loaded ? (
        <JsonLd
          data={breadcrumbJsonLd([
            { name: "Sipply", path: "/" },
            { name: "Weekly recaps", path: "/weekly" },
            { name: title(loaded.data), path: `/weekly/${week}` },
          ])}
        />
      ) : null}
      {loaded ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: title(loaded.data),
            description: describe(loaded.data),
            path: `/weekly/${week}`,
            stories: loaded.data.stories,
            dateModified: loaded.data.stories[0]?.lastSeenAt,
          })}
        />
      ) : null}
      <WeekPage week={loaded?.data ?? null} newer={newer} older={older} />
    </>
  );
}
