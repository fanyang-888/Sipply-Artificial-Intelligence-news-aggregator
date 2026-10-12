"use client";

import { Badge } from "@/components/shared/badge";
import {
  BilingualAssistHeading,
  BilingualAssistSubline,
} from "@/components/shared/bilingual-assist-text";
import { useI18n } from "@/lib/i18n";
import { uiPageTitle, uiMetaTextSm } from "@/lib/ui/classes";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { formatRelevancePercent } from "@/lib/utils/cluster-sources";
import {
  estimateClusterReadMinutes,
  getOutletDiversityFromArticles,
} from "@/lib/utils/cluster-meta";
import type { Cluster } from "@/types/cluster";
import type { Article } from "@/types/article";

type ClusterHeaderProps = {
  cluster: Cluster;
  articles: Article[];
};

export function ClusterHeader({ cluster, articles }: ClusterHeaderProps) {
  const { t, lang } = useI18n();
  const sourceCount = cluster.articleIds.length;
  const scoreLabel = formatRelevancePercent(cluster.clusterScore);
  const status = cluster.storyStatus ?? "—";
  const readMinutes = estimateClusterReadMinutes(cluster);
  const { uniqueOutletCount, articleCount } =
    getOutletDiversityFromArticles(articles);

  const diversityLine =
    articleCount === 0
      ? null
      : uniqueOutletCount >= 2
        ? t.cluster.formatSourceDiversityBroad(uniqueOutletCount, articleCount)
        : t.cluster.formatSourceDiversityNarrow(uniqueOutletCount, articleCount);

  return (
    <header className="mb-6">
      <Badge>{cluster.clusterType}</Badge>
      <h1 className={`mt-2 ${uiPageTitle}`}>
        <BilingualAssistHeading value={cluster.title} lang={lang} />
      </h1>
      {cluster.subtitle ? (
        <p className={`mt-2 ${uiMetaTextSm}`}>
          <BilingualAssistSubline value={cluster.subtitle} lang={lang} />
        </p>
      ) : null}

      <p className="mt-3 text-sm font-medium [color:var(--text-muted)]">
        {t.cluster.formatReadTimeMinutes(readMinutes)}
      </p>

      {diversityLine ? (
        <p className="mt-2 text-sm leading-snug [color:var(--text-muted)]">{diversityLine}</p>
      ) : null}

      <dl className="mt-4 grid gap-2 text-sm [color:var(--text-muted)] sm:grid-cols-2">
        <div className="flex flex-wrap gap-x-2 sm:col-span-2">
          <dt className="font-medium [color:var(--text-muted)]">{t.cluster.headerLastUpdated}</dt>
          <dd className="font-medium text-foreground">
            <LocalDateTime iso={cluster.lastSeenAt} lang={lang} />
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium [color:var(--text-muted)]">{t.cluster.headerStoryStatus}</dt>
          <dd>{status}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium [color:var(--text-muted)]">{t.cluster.headerSourceCount}</dt>
          <dd>{t.formatSourceCount(sourceCount)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-medium [color:var(--text-muted)]">{t.cluster.headerScore}</dt>
          <dd>{scoreLabel}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2 sm:col-span-2 text-xs [color:var(--text-muted)]">
          <dt className="font-medium">{t.cluster.headerFirstSeen}</dt>
          <dd>
            <LocalDateTime iso={cluster.firstSeenAt} lang={lang} />
          </dd>
        </div>
      </dl>
    </header>
  );
}
