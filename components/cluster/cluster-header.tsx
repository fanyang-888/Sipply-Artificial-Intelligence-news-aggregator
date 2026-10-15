"use client";

import {
  BilingualAssistHeading,
  BilingualAssistSubline,
} from "@/components/shared/bilingual-assist-text";
import { ShareButton } from "@/components/cluster/share-button";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { PageHeader } from "@/components/shared/page-header";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import {
  estimateClusterReadMinutes,
  getOutletDiversityFromArticles,
} from "@/lib/utils/cluster-meta";
import { topicGroupForTag } from "@/lib/utils/radar";
import { pickLocalized } from "@/lib/utils/localized-string";
import type { Cluster } from "@/types/cluster";
import type { Article } from "@/types/article";

type ClusterHeaderProps = {
  cluster: Cluster;
  articles: Article[];
};

const DAY_MS = 86_400_000;

/**
 * The story's opening, in the home page's language: a mono line (category ·
 * reading time · dates), the headline under one light, and how many outlets
 * carry it (amber when it's a single outlet, which readers should verify).
 * Internal fields (cluster type, status, score) are left out: they mean
 * nothing to a reader.
 */
export function ClusterHeader({ cluster, articles }: ClusterHeaderProps) {
  const { t, lang } = useI18n();
  const readMinutes = estimateClusterReadMinutes(cluster);
  const { uniqueOutletCount, articleCount } = getOutletDiversityFromArticles(articles);
  const narrow = uniqueOutletCount < 2;
  const diversityLine =
    articleCount === 0
      ? null
      : narrow
        ? t.cluster.formatSourceDiversityNarrow(uniqueOutletCount, articleCount)
        : t.cluster.formatSourceDiversityBroad(uniqueOutletCount, articleCount);
  // "First seen" only adds something when the story has been running for days
  const longRunning =
    cluster.firstSeenAt && cluster.lastSeenAt && Date.parse(cluster.lastSeenAt) - Date.parse(cluster.firstSeenAt) >= DAY_MS;
  const group = cluster.topicTag ? topicGroupForTag(cluster.topicTag) : null;
  const category = group ? topicGroupByKey(group) : undefined;

  return (
    <PageHeader
      back={{ href: "/", label: t.nav.dailyDigest }}
      eyebrow={
        <>
          {category ? <span className="[color:var(--accent)]">{topicGroupLabel(category, lang)}</span> : null}
          <span>{t.cluster.formatReadTimeMinutes(readMinutes)}</span>
          <span className="normal-case tracking-[0.06em]">
            {t.cluster.headerLastUpdated} <LocalDateTime iso={cluster.lastSeenAt} lang={lang} />
          </span>
          {longRunning ? (
            <span className="normal-case tracking-[0.06em]">
              {t.cluster.headerFirstSeen} <LocalDateTime iso={cluster.firstSeenAt} lang={lang} />
            </span>
          ) : null}
        </>
      }
      title={<BilingualAssistHeading value={cluster.title} lang={lang} />}
      description={cluster.subtitle ? <BilingualAssistSubline value={cluster.subtitle} lang={lang} /> : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {diversityLine ? (
          <p className={`text-[13.5px] leading-snug ${narrow ? "[color:var(--amber)]" : "[color:var(--text-muted)]"}`}>
            {diversityLine}
          </p>
        ) : null}
        <ShareButton title={pickLocalized(cluster.title, lang)} />
      </div>
    </PageHeader>
  );
}
