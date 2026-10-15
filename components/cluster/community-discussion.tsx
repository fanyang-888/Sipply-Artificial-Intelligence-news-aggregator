"use client";

import { SectionTitle } from "@/components/shared/section-title";
import { RadarSignalItem } from "@/components/radar/radar-bits";
import { useI18n } from "@/lib/i18n";
import { useNowMinute } from "@/lib/use-now-minute";
import type { Cluster } from "@/types/cluster";

/**
 * The community side of a story: the most-engaged Hacker News / Bluesky / …
 * posts of the Trend Radar topic that this story covers. Hidden when there are none.
 */
export function CommunityDiscussion({ posts }: { posts: Cluster["discussions"] }) {
  const { t } = useI18n();
  const now = useNowMinute();
  if (!posts?.length) return null;
  return (
    <section aria-labelledby="story-community">
      <SectionTitle id="story-community">{t.cluster.communityTitle}</SectionTitle>
      <p className="mb-4 text-[13px] [color:var(--text-muted)]">{t.cluster.communityDesc}</p>
      <ul className="sp-glass sp-rows px-6 py-1">
        {posts.map((s) => (
          <RadarSignalItem key={s.id} signal={s} now={now} />
        ))}
      </ul>
    </section>
  );
}
