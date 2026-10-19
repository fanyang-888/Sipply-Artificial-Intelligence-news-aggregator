"use client";

import { useEffect, useState } from "react";
import { ClusterPageView } from "@/components/cluster/cluster-page-view";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { useI18n } from "@/lib/i18n";
import { fetchCluster, fetchClusterBySlug } from "@/lib/api";
import { apiClusterToCluster } from "@/lib/api/mappers";
import { trackEvent } from "@/lib/api/track";
import type { ApiCluster } from "@/lib/api/types";
import type { Cluster } from "@/types/cluster";
import type { TodayPosition } from "@/lib/utils/today-position";

type ClusterPageClientProps = {
  /** Server-fetched story; null when the server couldn't reach the API (fetch here instead). */
  initial: { cluster: ApiCluster; related: ApiCluster[]; today: TodayPosition | null } | null;
  /** The URL's story key, for the client-side fetch when there is no server copy. */
  slug: string;
};

export function ClusterPageClient({ initial, slug }: ClusterPageClientProps) {
  const { t } = useI18n();

  const [cluster, setCluster] = useState<Cluster | null>(() =>
    initial ? apiClusterToCluster(initial.cluster) : null,
  );
  const [related, setRelated] = useState<Cluster[]>(() =>
    initial ? initial.related.map(apiClusterToCluster) : [],
  );
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);

  // Reading history is kept by story id, whatever the address
  const id = cluster?.id;
  useEffect(() => {
    if (!id) return;
    trackEvent("cluster_viewed", id);
  }, [id]);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchClusterBySlug(slug);
        if (cancelled) return;
        const mapped = apiClusterToCluster(data);
        setCluster(mapped);

        // Fetch related clusters in parallel (fire-and-forget; failures are silent)
        if (mapped.relatedClusterIds?.length) {
          Promise.all(
            mapped.relatedClusterIds.map((rid) =>
              fetchCluster(rid).then(apiClusterToCluster).catch(() => null)
            )
          ).then((results) => {
            if (!cancelled)
              setRelated(results.filter((r): r is Cluster => r !== null));
          });
        }
      } catch (e) {
        if (!cancelled)
          setError((e as Error).message ?? "Cluster not found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug, initial]);

  if (loading) return <LoadingState layout="detail" />;

  if (error || !cluster) {
    return (
      <ErrorState
        title={t.notFound.clusterTitle}
        message={error ?? t.notFound.clusterMessage}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const today = initial?.today ?? null;
  return (
    <ClusterPageView
      cluster={cluster}
      articles={cluster.articles ?? []}
      related={related}
      next={today?.next ? apiClusterToCluster(today.next) : undefined}
      inDigest={today?.inDigest ?? false}
    />
  );
}
