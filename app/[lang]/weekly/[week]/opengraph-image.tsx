import { getWeek } from "@/lib/api/server";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, siteCard } from "@/lib/seo/og-card";
import { formatWeekRange } from "@/lib/utils/weeks";

export const alt = "A week of AI news on Sipply";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The week's share image: its date range as the headline, the companies it was about below. */
export default async function Image({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  try {
    const data = await getWeek(week);
    const companies = data.topics.slice(0, 4).map((t) => t.name).join(", ");
    return ogCard({
      eyebrow: ["Weekly recap", week],
      title: `AI news, ${formatWeekRange(data.start, data.end, "en")}`,
      subtitle: `${data.storyCount} stories${companies ? `, with ${companies}` : ""}.`,
    });
  } catch {
    return siteCard();
  }
}
