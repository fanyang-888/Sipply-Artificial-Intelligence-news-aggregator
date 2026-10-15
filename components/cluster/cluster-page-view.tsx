"use client";

import { useI18n } from "@/lib/i18n";
import { ClusterBreadcrumbs } from "@/components/cluster/cluster-breadcrumbs";
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
import { SectionTitle } from "@/components/shared/section-title";
import { getNextClusterInRankOrder } from "@/lib/utils/cluster-meta";
import type { Cluster } from "@/types/cluster";
import type { Article } from "@/types/article";

type ClusterPageViewProps = {
  cluster: Cluster;
  articles: Article[];
  related: Cluster[];
};

export function ClusterPageView({
  cluster,
  articles,
  related,
}: ClusterPageViewProps) {
  const { t, lang } = useI18n();
  const nextCluster = getNextClusterInRankOrder(cluster.id);

  return (
    <article>
      <ClusterBreadcrumbs clusterTitle={cluster.title} />

      <div className="max-w-3xl">
        <div className="min-w-0">
          <ClusterHeader cluster={cluster} articles={articles} />

          {lang === "zh" ? (
            <BilingualTrustNote>{t.cluster.bilingualAssistTrustNote}</BilingualTrustNote>
          ) : null}

          <section className="mb-6">
            <SectionTitle>{t.cluster.summary}</SectionTitle>
            <BilingualAssistBody value={cluster.summary} lang={lang} />
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
      </div>
    </article>
  );
}
