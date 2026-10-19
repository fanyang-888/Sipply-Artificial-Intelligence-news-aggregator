import { getClusterBySlug } from "@/lib/api/server";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, siteCard } from "@/lib/seo/og-card";
import { topicGroupForTag } from "@/lib/utils/radar";

export const alt = "A story on Sipply";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The story's headline as its share image: category · date, the title, the first lines of the summary. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const story = await getClusterBySlug(slug);
    const group = story.topicTag ? topicGroupForTag(story.topicTag) : null;
    const category = group ? topicGroupByKey(group) : undefined;
    const eyebrow = [category ? topicGroupLabel(category, "en") : "AI news"];
    if (story.lastSeenAt) eyebrow.push(DAY.format(new Date(story.lastSeenAt)));
    return ogCard({ eyebrow, title: story.title.en, subtitle: story.summary.en });
  } catch {
    return siteCard();
  }
}
