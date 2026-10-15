"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchSearch } from "@/lib/api";
import { apiRowToArchiveRow, type ArchiveResultRow } from "@/lib/mappers/archive";
import { archiveHref, parseArchiveQuery } from "@/lib/utils/archive-url";
import { topicTagsForGroup } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { ArchiveTimelineRow } from "@/components/archive/archive-timeline-row";
import { ArchiveThemeSuggestions } from "@/components/archive/archive-theme-suggestions";
import { ArchiveToolbar } from "@/components/archive/archive-toolbar";
import { PageHeader } from "@/components/shared/page-header";
import { SectionBlock } from "@/components/shared/section-block";
import { uiButtonSecondary, uiMicroLabel, uiTab } from "@/lib/ui/classes";
import { EmptyState } from "@/components/shared/empty-state";
import { NoResultsState } from "@/components/shared/no-results-state";
import { LoadingState } from "@/components/shared/loading-state";

function TimelineList({
  rows,
  keyword,
  lang,
  storyCountLabel,
}: {
  rows: ArchiveResultRow[];
  keyword: string;
  lang: string;
  storyCountLabel: (n: number) => string;
}) {
  // Build groups: [{dateKey, marker, items}]
  const groups: { dateKey: string; marker: DayMarker; items: ArchiveResultRow[] }[] = [];
  for (const row of rows) {
    const key = row.dateKey;
    const last = groups[groups.length - 1];
    if (last && last.dateKey === key) {
      last.items.push(row);
    } else {
      groups.push({ dateKey: key, marker: formatDayMarker(key, lang), items: [row] });
    }
  }

  // Each day: its date on the left (sticky while its rows scroll by), the rows in one glass panel
  return (
    <div className="space-y-8">
      {groups.map((group, gi) => (
        <section key={`${group.dateKey}-${gi}`} className="sm:grid sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-8">
          <div className="mb-3 flex items-baseline gap-2 font-mono sm:sticky sm:top-36 sm:mb-0 sm:block sm:self-start sm:pt-4 sm:text-right">
            <span className="text-[14px] font-medium leading-tight [color:var(--accent)] sm:block sm:text-[15px]">
              {group.marker.primary}
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.12em] [color:var(--text-muted)] sm:mt-1 sm:block">
              {group.marker.secondary}
              {group.marker.secondary ? " · " : ""}
              {storyCountLabel(group.items.length)}
            </span>
          </div>
          <div className="sp-glass sp-rows overflow-hidden">
            {group.items.map((row) => (
              <ArchiveTimelineRow key={row.id} row={row} highlightQuery={keyword} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const KEYWORD_URL_DEBOUNCE_MS = 350;
const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

type SortBy = "score" | "date";

type DayMarker = { primary: string; secondary: string };

function formatDayMarker(dateKey: string, lang: string): DayMarker {
  if (dateKey === "unknown") {
    return { primary: lang === "zh" ? "未知日期" : "Unknown", secondary: "" };
  }
  const d = new Date(dateKey + "T12:00:00Z");
  if (lang === "zh") {
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return {
      primary: `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`,
      secondary: weekdays[d.getUTCDay()],
    };
  }
  return {
    primary: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d),
    secondary: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d),
  };
}

export function ArchivePageClient() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState("");
  const [topic, setTopic] = useState("");
  // Timeline layout browses chronologically by default; "Best match" is for keyword search
  const [sortBy, setSortBy] = useState<SortBy>("date");

  const [rows, setRows] = useState<ArchiveResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const spKey = searchParams.toString();
  useEffect(() => {
    const p = parseArchiveQuery(new URLSearchParams(spKey));
    startTransition(() => {
      setKeyword(p.q);
      setTopic(p.topic);
    });
  }, [spKey]);

  // URL debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFiltersRef = useRef({ topic: "" });
  useEffect(() => {
    latestFiltersRef.current = { topic };
  }, [topic]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Search debounce
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (
    q: string,
    topicKey: string,
    sort: SortBy,
    offset: number,
    append: boolean,
  ) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const tags = topicKey ? topicTagsForGroup(topicKey) : [];
      const result = await fetchSearch({
        q: q || undefined,
        topicTags: tags.length ? tags : undefined,
        limit: PAGE_SIZE,
        offset,
        sortBy: sort,
      });

      const newRows = result.clusters.map(c => apiRowToArchiveRow(c, t, lang, Date.now()));
      setRows(prev => append ? [...prev, ...newRows] : newRows);
      setTotal(result.total);
    } catch {
      if (!append) setRows([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
      setInitialLoaded(true);
    }
  }, [t, lang]);

  // Re-search when filters change (reset to page 1)
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      doSearch(keyword, topic, sortBy, 0, false);
    }, keyword ? SEARCH_DEBOUNCE_MS : 0);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [keyword, topic, sortBy, doSearch]);

  const handleLoadMore = useCallback(() => {
    doSearch(keyword, topic, sortBy, rows.length, true);
  }, [keyword, topic, sortBy, rows.length, doSearch]);

  const scheduleKeywordUrlSync = useCallback((nextQ: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const { topic: tp } = latestFiltersRef.current;
      router.replace(archiveHref({ q: nextQ, topic: tp }));
    }, KEYWORD_URL_DEBOUNCE_MS);
  }, [router]);

  function handleKeywordChange(value: string) { setKeyword(value); scheduleKeywordUrlSync(value); }
  function handleTopicChange(k: string) { if (debounceRef.current) clearTimeout(debounceRef.current); setTopic(k); router.replace(archiveHref({ q: keyword, topic: k })); }

  const hasActiveFilters = Boolean(keyword.trim() || topic);
  const showNoResults = rows.length === 0 && hasActiveFilters && !loading && initialLoaded;
  const showAllEmpty = rows.length === 0 && !hasActiveFilters && !loading && initialLoaded;
  const hasMore = rows.length < total && rows.length > 0;

  return (
    <div>
      <PageHeader title={t.archive.title} description={t.archive.description}>
        {/* The top nav shows only icons on phones; these pages are reachable from here too */}
        <p className={`${uiMicroLabel} flex flex-wrap items-center gap-x-3 gap-y-1`}>
          <span>{t.hubs.browse}</span>
          <Link href="/topics" className="no-underline [color:var(--accent)] hover:underline">
            {t.hubs.topicsTitle}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/weekly" className="no-underline [color:var(--accent)] hover:underline">
            {t.hubs.weeklyTitle}
          </Link>
        </p>
      </PageHeader>

      <ArchiveToolbar
        topic={topic}
        onTopicChange={handleTopicChange}
        keyword={keyword}
        onKeywordChange={handleKeywordChange}
      />

      <SectionBlock>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            {initialLoaded && !loading && total > 0 && (
              <span className={uiMicroLabel}>{t.archive.resultCountStories(total)}</span>
            )}
          </div>
          {initialLoaded && rows.length > 0 && (
            <div className="flex shrink-0 items-center gap-4" role="group" aria-label={t.archive.sortLabel}>
              <button type="button" aria-pressed={sortBy === "score"} onClick={() => setSortBy("score")} className={uiTab(sortBy === "score")}>
                {t.archive.sortBestMatch}
              </button>
              <button type="button" aria-pressed={sortBy === "date"} onClick={() => setSortBy("date")} className={uiTab(sortBy === "date")}>
                {t.archive.sortNewest}
              </button>
            </div>
          )}
        </div>

        <div className="min-h-[min(45vh,22rem)]">
          {loading ? (
            <LoadingState layout="archive" />
          ) : showAllEmpty ? (
            <EmptyState title={t.archive.emptyCatalog}>
              <ArchiveThemeSuggestions onPickTopic={handleTopicChange} activeTopic={topic} />
            </EmptyState>
          ) : showNoResults ? (
            <NoResultsState title={t.archive.noResultsTitle} message={t.archive.noResultsMessage}>
              <ArchiveThemeSuggestions onPickTopic={handleTopicChange} activeTopic={topic} />
            </NoResultsState>
          ) : (
            <>
              <TimelineList
                rows={rows}
                keyword={keyword}
                lang={lang}
                storyCountLabel={t.archive.resultCountStories}
              />

              {hasMore && (
                <div className="mt-10 flex justify-center">
                  <button type="button" onClick={handleLoadMore} disabled={loadingMore} className={uiButtonSecondary}>
                    {loadingMore ? t.archive.loadingMore : t.archive.loadMore(total - rows.length)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </SectionBlock>
    </div>
  );
}
