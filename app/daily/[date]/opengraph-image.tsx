import { getDay } from "@/lib/api/server";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, siteCard } from "@/lib/seo/og-card";
import { formatDay, isDayKey } from "@/lib/utils/days";

export const alt = "A day of AI news on Sipply";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The day's share image: the date as the headline, the lead story below. */
export default async function Image({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isDayKey(date)) return siteCard();
  try {
    const data = await getDay(date);
    const lead = data.headlines[0]?.title;
    return ogCard({
      eyebrow: ["AI news by day", date],
      title: `AI news, ${formatDay(date, "en")}`,
      subtitle: `${data.storyCount} ${data.storyCount === 1 ? "story" : "stories"}${lead ? `, led by: ${lead}` : "."}`,
    });
  } catch {
    return siteCard();
  }
}
