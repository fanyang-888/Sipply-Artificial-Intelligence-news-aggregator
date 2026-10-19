import { getTopic } from "@/lib/api/server";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard, siteCard } from "@/lib/seo/og-card";

export const alt = "A company or model family on Sipply";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The topic's share image: its name as the headline, its story counts below. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const topic = await getTopic(slug);
    return ogCard({
      eyebrow: ["Companies & models"],
      title: `${topic.name}: the latest AI news`,
      subtitle: `${topic.storyCount} stories in the last 30 days · ${topic.totalStories} in all, newest first.`,
    });
  } catch {
    return siteCard();
  }
}
