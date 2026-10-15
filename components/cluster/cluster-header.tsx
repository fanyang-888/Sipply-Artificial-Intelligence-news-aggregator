"use client";

import {
  BilingualAssistHeading,
  BilingualAssistSubline,
} from "@/components/shared/bilingual-assist-text";
import { useI18n } from "@/lib/i18n";
import { uiPageTitle, uiMetaTextSm } from "@/lib/ui/classes";
import { LocalDateTime } from "@/components/shared/local-date-time";
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

const DAY_MS = 86_400_000;

/**
 * Title, then two plain lines instead of a label: value grid: reading time
 * and dates, and how many outlets carry it (amber when it's a single outlet,
 * which readers should verify). Internal fields (cluster type, status,
 * cluster score) are left out: they mean nothing to a reader.
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

  return (
    <header className="mb-6">
      <h1 className={uiPageTitle}>
        <BilingualAssistHeading value={cluster.title} lang={lang} />
      </h1>
      {cluster.subtitle ? (
        <p className={`mt-2 ${uiMetaTextSm}`}>
          <BilingualAssistSubline value={cluster.subtitle} lang={lang} />
        </p>
      ) : null}

      <p className="mt-3 text-sm [color:var(--text-muted)]">
        {t.cluster.formatReadTimeMinutes(readMinutes)} · {t.cluster.headerLastUpdated}{" "}
        <LocalDateTime iso={cluster.lastSeenAt} lang={lang} />
        {longRunning ? (
          <>
            {" · "}
            {t.cluster.headerFirstSeen} <LocalDateTime iso={cluster.firstSeenAt} lang={lang} />
          </>
        ) : null}
      </p>
      {diversityLine ? (
        <p className={`mt-1 text-sm leading-snug ${narrow ? "[color:var(--amber)]" : "[color:var(--text-muted)]"}`}>
          {diversityLine}
        </p>
      ) : null}
    </header>
  );
}
