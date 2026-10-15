"use client";

import { useEffect, useRef, useState } from "react";
import { formatDigestDate } from "@/lib/utils/format-date";
import { useI18n } from "@/lib/i18n";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { HomePanel } from "@/components/home/home-panel";
import { LeadStory } from "@/components/home/lead-story";
import { RadarTeaser } from "@/components/home/radar-teaser";
import { StoryCarousel } from "@/components/home/story-carousel";
import { WeekPanel } from "@/components/home/week-panel";
import { fetchSearch, fetchTodayDigest } from "@/lib/api";
import { apiClusterToCluster, archiveRowToCluster } from "@/lib/api/mappers";
import { getDeviceId } from "@/lib/api/track";
import { TOPIC_GROUPS, TRENDING_LABEL, topicGroupLabel, topicTagsForGroup, type TopicGroupKey } from "@/lib/constants/topic-groups";
import { readPreferredRole, usePreferredRole, type Role } from "@/lib/preferred-role";
import { archiveTopicHref } from "@/lib/utils/archive-url";
import { useMounted } from "@/lib/use-mounted";
import type { ApiDigest, ApiRadarTopic, ApiWeekSummary } from "@/lib/api/types";
import type { Cluster } from "@/types/cluster";

type CategoryKey = "trending" | TopicGroupKey;

const CATEGORY_PAGE_SIZE = 12;

type HomeT = ReturnType<typeof useI18n>["t"];

function freshnessLabelFrom(lastSeenAt: string | null, t: HomeT): string | undefined {
  if (!lastSeenAt) return undefined;
  const diff = (Date.now() - new Date(lastSeenAt).getTime()) / 60000;
  if (diff < 60) return t.archive.freshnessMinutes(Math.round(diff));
  if (diff < 1440) return t.archive.freshnessHours(Math.round(diff / 60));
  return t.archive.freshnessDays(Math.round(diff / 1440));
}

type HomePageClientProps = {
  /** Server-rendered global digest (so crawlers see the stories); null if the API was unreachable. */
  initialDigest: ApiDigest | null;
  /** When the last pipeline run finished; null hides the "Updated" line. */
  pipelineUpdatedAt: string | null;
  /** The radar's leading topics for panel 03; empty hides the panel. */
  radarTopics: ApiRadarTopic[];
  radarSignals: number;
  radarWindowDays: number;
  /** This ISO week's summary (headlines) for panel 04. */
  week: ApiWeekSummary | null;
};

/**
 * The home page as four full-screen panels: 01 today's lead story, 02 today's
 * stories as a sideways carousel, 03 what the AI community is discussing (Trend
 * Radar), 04 this week + the weekly email.
 */
export function HomePageClient({
  initialDigest,
  pipelineUpdatedAt,
  radarTopics,
  radarSignals,
  radarWindowDays,
  week,
}: HomePageClientProps) {
  const { t, lang } = useI18n();
  const [role] = usePreferredRole();
  // The reader's local date only after mount: the server's date/time zone may differ
  const mounted = useMounted();
  const dateLabel = mounted ? formatDigestDate(new Date(), lang) : "";

  const [featured, setFeatured] = useState<Cluster | null>(() =>
    initialDigest?.featured ? apiClusterToCluster(initialDigest.featured) : null,
  );
  const [topClusters, setTopClusters] = useState<Cluster[]>(() =>
    initialDigest ? initialDigest.topClusters.map(apiClusterToCluster) : [],
  );
  const [loading, setLoading] = useState(initialDigest === null);
  const [error, setError] = useState<string | null>(null);
  const [personalized, setPersonalized] = useState(false);
  // Role the current list was ranked for; undefined until the first load finishes
  const rankedForRoleRef = useRef<Role | null | undefined>(undefined);

  const [activeCategory, setActiveCategory] = useState<CategoryKey>("trending");
  const [categoryCache, setCategoryCache] = useState<Partial<Record<TopicGroupKey, Cluster[]>>>({});
  const [categoryLoading, setCategoryLoading] = useState(false);

  // Freshness labels are baked per-language — refetch category lists on toggle
  useEffect(() => {
    setCategoryCache({});
  }, [lang]);

  // Fetch a category's recent stories on first visit to that tab
  useEffect(() => {
    if (activeCategory === "trending" || categoryCache[activeCategory]) return;
    let cancelled = false;
    setCategoryLoading(true);
    fetchSearch({
      topicTags: topicTagsForGroup(activeCategory),
      limit: CATEGORY_PAGE_SIZE,
      sortBy: "date",
    })
      .then((res) => {
        if (cancelled) return;
        const clusters = res.clusters.map((row) =>
          archiveRowToCluster(row, freshnessLabelFrom(row.lastSeenAt, t)),
        );
        setCategoryCache((prev) => ({ ...prev, [activeCategory]: clusters }));
      })
      .catch(() => {
        if (!cancelled) setCategoryCache((prev) => ({ ...prev, [activeCategory]: [] }));
      })
      .finally(() => {
        if (!cancelled) setCategoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeCategory, categoryCache, t]);

  const categoryClusters =
    activeCategory === "trending" ? null : categoryCache[activeCategory] ?? null;

  // Fetch this reader's order (history + role). With a server-rendered digest
  // already on screen this re-ranks in place; without one it is the first load.
  useEffect(() => {
    let cancelled = false;
    const hasInitial = initialDigest !== null;
    // Read the role directly: the role hook still reports null during hydration
    const role = readPreferredRole();

    async function load() {
      try {
        if (!hasInitial) {
          setLoading(true);
          setError(null);
        }
        const digest = await fetchTodayDigest({ deviceId: getDeviceId(), role });

        if (cancelled) return;

        setFeatured(digest.featured ? apiClusterToCluster(digest.featured) : null);
        setTopClusters(digest.topClusters.map(apiClusterToCluster));
        setPersonalized(Boolean(digest.personalized));
        rankedForRoleRef.current = role;
      } catch (e) {
        if (cancelled) return;
        if (hasInitial) {
          // Keep the global order; a later role change can still re-rank
          rankedForRoleRef.current = null;
        } else {
          setError((e as Error).message ?? "Failed to load digest");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [initialDigest]);

  // Re-rank today's list in place (no loading screen) when the reader switches role
  useEffect(() => {
    if (rankedForRoleRef.current === undefined || rankedForRoleRef.current === role) return;
    let cancelled = false;
    fetchTodayDigest({ deviceId: getDeviceId(), role })
      .then((digest) => {
        if (cancelled) return;
        rankedForRoleRef.current = role;
        setTopClusters(digest.topClusters.map(apiClusterToCluster));
        setPersonalized(Boolean(digest.personalized));
      })
      .catch(() => {
        // keep the current order
      });
    return () => { cancelled = true; };
  }, [role]);

  if (loading) {
    return <LoadingState layout="digest" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load today's digest"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const lead = featured ?? topClusters[0] ?? null;
  const rest = topClusters.filter((c) => c.id !== lead?.id);
  const categoryStories = activeCategory === "trending" ? rest : categoryClusters;
  const categoryKeys: CategoryKey[] = ["trending", ...TOPIC_GROUPS.map((g) => g.key)];
  const categoryName = (key: CategoryKey) =>
    key === "trending" ? TRENDING_LABEL[lang] : topicGroupLabel(TOPIC_GROUPS.find((g) => g.key === key)!, lang);

  return (
    <div>
      {lead ? (
        <LeadStory story={lead} dateLabel={dateLabel} updatedAt={pipelineUpdatedAt} more={rest.length} />
      ) : (
        <div className="py-24">
          <EmptyState title={t.home.emptyFeaturedTitle} description={t.home.emptyFeaturedDesc} />
        </div>
      )}

      <HomePanel
        id="today"
        title={
          <>
            {t.home.todayTitle}
            <span className="block [color:var(--text-muted)]">{t.home.todaySubtitle}</span>
          </>
        }
        subtitle={activeCategory === "trending" && personalized ? <><span className="[color:var(--accent)]">✦</span> {t.home.personalizedNote}</> : undefined}
      >
        <div role="tablist" aria-label={t.home.categoryBarAria} className="mb-6 flex flex-wrap justify-center gap-x-5 gap-y-2">
          {categoryKeys.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeCategory === key}
              onClick={() => setActiveCategory(key)}
              className={[
                "border-b pb-1 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                activeCategory === key ? "text-foreground [border-color:var(--accent)]" : "border-transparent [color:var(--text-muted)] hover:text-foreground",
              ].join(" ")}
            >
              {categoryName(key)}
            </button>
          ))}
        </div>
        {activeCategory !== "trending" && categoryLoading ? (
          <div className="flex justify-center gap-6 overflow-hidden" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="sp-glass h-[24rem] w-[min(40rem,86vw)] shrink-0 animate-pulse" />
            ))}
          </div>
        ) : categoryStories && categoryStories.length > 0 ? (
          <StoryCarousel
            stories={categoryStories}
            label={categoryName(activeCategory)}
            moreHref={activeCategory === "trending" ? "/archive" : archiveTopicHref(activeCategory)}
          />
        ) : (
          <EmptyState title={activeCategory === "trending" ? t.home.emptyClustersTitle : t.archive.noResultsTitle} />
        )}
      </HomePanel>

      {radarTopics.length > 0 ? (
        <HomePanel
          title={
            <>
              {t.home.communityTitle}
              <span className="block [color:var(--text-muted)]">{t.home.communityTitle2}</span>
            </>
          }
          subtitle={t.home.communitySubtitle(radarSignals, radarWindowDays)}
        >
          <RadarTeaser topics={radarTopics} windowDays={radarWindowDays} />
        </HomePanel>
      ) : null}

      <HomePanel
        title={
          <>
            {t.home.weekTitle}
            <span className="block [color:var(--text-muted)]">{t.home.weekTitle2}</span>
          </>
        }
      >
        <WeekPanel week={week} />
      </HomePanel>
    </div>
  );
}
