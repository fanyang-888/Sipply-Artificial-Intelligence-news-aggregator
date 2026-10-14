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
import { SectionBlock } from "@/components/shared/section-block";
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

  return (
    <div className="relative sm:ml-[118px] sm:border-l-2 sm:pl-8 sm:[border-color:var(--border)]">
      {groups.map((group, gi) => (
        <div key={`${group.dateKey}-${gi}`}>
          <div className={`relative mb-2.5 ${gi === 0 ? "" : "mt-8"}`}>
            {/* rail dot + left date label (sm+) */}
            <span
              className="absolute top-[5px] hidden h-3 w-3 rounded-full [background:var(--accent)] sm:-left-[39px] sm:block"
              style={{ boxShadow: "0 0 0 3px var(--bg)" }}
            />
            <span
              className="absolute top-0 hidden w-24 text-right sm:-left-[150px] sm:block"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              <span className="block text-[15px] font-medium leading-tight [color:var(--accent)]">
                {group.marker.primary}
              </span>
              <span className="text-[10px] uppercase tracking-[0.08em] [color:var(--text-muted)]">
                {group.marker.secondary}
              </span>
            </span>
            {/* inline date (mobile) + story count */}
            <span className="flex items-baseline gap-2">
              <span
                className="text-[13px] font-medium [color:var(--accent)] sm:hidden"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {group.marker.primary} · {group.marker.secondary}
              </span>
              <span className="text-[11px] [color:var(--text-dim)]">
                {storyCountLabel(group.items.length)}
              </span>
            </span>
          </div>
          {group.items.map((row) => (
            <ArchiveTimelineRow key={row.id} row={row} highlightQuery={keyword} />
          ))}
        </div>
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
      <div className="mb-4">
        <h1
          className="text-4xl"
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, color: "var(--sp-navy)" }}
        >
          {t.archive.title}
        </h1>
        <p className="mt-1.5 text-sm [color:var(--text-muted)]">{t.archive.description}</p>
        {/* The top nav shows only icons on phones; these pages are reachable from here too */}
        <p className="mt-2 text-sm [color:var(--text-muted)]">
          {t.hubs.browse}:{" "}
          <Link href="/topics" className="[color:var(--accent)] hover:underline">
            {t.hubs.topicsTitle}
          </Link>{" "}
          ·{" "}
          <Link href="/weekly" className="[color:var(--accent)] hover:underline">
            {t.hubs.weeklyTitle}
          </Link>
        </p>
      </div>

      <ArchiveToolbar
        topic={topic}
        onTopicChange={handleTopicChange}
        keyword={keyword}
        onKeywordChange={handleKeywordChange}
      />

      <SectionBlock>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            {initialLoaded && !loading && total > 0 && (
              <span className="text-sm [color:var(--text-muted)]">
                {t.archive.resultCountStories(total)}
              </span>
            )}
          </div>
          {initialLoaded && rows.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setSortBy("score")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === "score"
                    ? "bg-foreground text-background"
                    : "[color:var(--text-muted)] hover:text-foreground"
                }`}
              >
                {t.archive.sortBestMatch}
              </button>
              <button
                onClick={() => setSortBy("date")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === "date"
                    ? "bg-foreground text-background"
                    : "[color:var(--text-muted)] hover:text-foreground"
                }`}
              >
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
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-md border [border-color:var(--border)] px-5 py-2 text-sm font-medium [color:var(--text-muted)] transition-colors hover:[border-color:var(--border)] hover:text-foreground disabled:opacity-50"
                  >
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
