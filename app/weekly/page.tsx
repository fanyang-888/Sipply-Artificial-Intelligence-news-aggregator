import type { Metadata } from "next";
import { getWeeks, isBuildPhase } from "@/lib/api/server";
import type { ApiWeekSummary } from "@/lib/api/types";
import { isoWeekKey } from "@/lib/utils/weeks";
import { WeeksIndex } from "@/components/hubs/hub-pages";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Weekly recaps",
  description: "The week's top AI stories, by category and company, every week.",
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
  return <WeeksIndex weeks={await load()} currentWeek={isoWeekKey(new Date())} />;
}
