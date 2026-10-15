"use client";

import { useI18n } from "@/lib/i18n";
import { ClusterHeader } from "@/components/cluster/cluster-header";
import { TakeawayList } from "@/components/cluster/takeaway-list";
import { WhyItMattersSection } from "@/components/cluster/why-it-matters-section";
import { CoveredSourcesList } from "@/components/cluster/covered-sources-list";
import { RelatedStories } from "@/components/cluster/related-stories";
import { RelatedTopics } from "@/components/cluster/related-topics";
import { CommunityDiscussion } from "@/components/cluster/community-discussion";
import { ClusterStoryFooter } from "@/components/cluster/cluster-story-footer";
import {
  BilingualAssistBody,
  BilingualTrustNote,
} from "@/components/shared/bilingual-assist-text";
import { getNextClusterInRankOrder } from "@/lib/utils/cluster-meta";
import type { Cluster } from "@/types/cluster";
import type { Article } from "@/types/article";

type ClusterPageViewProps = {
  cluster: Cluster;
  articles: Article[];
  related: Cluster[];
};

/**
 * A story: the headline under one light, then one reading column. The summary
 * opens the column as its lead paragraph (its heading is for screen readers
 * and crawlers only); the rest are titled sections.
 */
export function ClusterPageView({
  cluster,
  articles,
  related,
}: ClusterPageViewProps) {
  const { t, lang } = useI18n();
  const nextCluster = getNextClusterInRankOrder(cluster.id);

  return (
    <article>
      <ClusterHeader cluster={cluster} articles={articles} />

      <div className="max-w-3xl space-y-12">
        {lang === "zh" ? <BilingualTrustNote>{t.cluster.bilingualAssistTrustNote}</BilingualTrustNote> : null}

        <section aria-labelledby="story-summary">
          <h2 id="story-summary" className="sr-only">
            {t.cluster.summary}
          </h2>
          <BilingualAssistBody
            value={cluster.summary}
            lang={lang}
            className="space-y-4 text-[17px] leading-[1.7] text-foreground sm:text-[18px]"
          />
        </section>

        <TakeawayList items={cluster.takeaways} />
        <WhyItMattersSection
          overview={cluster.whyItMatters}
          audience={cluster.audience}
        />
        <CoveredSourcesList articles={articles} />
        <CommunityDiscussion posts={cluster.discussions} />
        <RelatedTopics topics={cluster.topics} />
        <RelatedStories clusters={related} />
        <ClusterStoryFooter nextCluster={nextCluster} />
      </div>
    </article>
  );
}
