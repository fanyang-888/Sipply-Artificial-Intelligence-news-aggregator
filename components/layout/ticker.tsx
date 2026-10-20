"use client";

import { useEffect, useState } from "react";
import { fetchTodayDigest } from "@/lib/api";
import type { ApiCluster } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import type { Lang } from "@/lib/i18n";
import { topicGroupForTag } from "@/lib/utils/radar";

const MAX_ITEMS = 8;

/** The story's category in ``lang`` ("MODELS", "模型发布"); the raw tag when it has no group. */
function categoryLabel(c: ApiCluster, lang: Lang): string {
  const group = c.topicTag ? topicGroupForTag(c.topicTag) : null;
  const known = group ? topicGroupByKey(group) : undefined;
  if (known) return lang === "zh" ? topicGroupLabel(known, "zh") : topicGroupLabel(known, "en").toUpperCase();
  return lang === "zh" ? "AI" : (c.topicTag ?? "AI").toUpperCase();
}

/** "CATEGORY · headline" for today's top stories in ``lang`` (decorative; the stories are in the page). */
export function tickerItems(featured: ApiCluster | null, top: ApiCluster[], lang: Lang = "en"): string[] {
  const seen = new Set<string>();
  return [featured, ...top]
    .filter((c): c is ApiCluster => {
      if (!c || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .slice(0, MAX_ITEMS)
    .map((c) => `${categoryLabel(c, lang)} · ${(lang === "zh" && c.title.zh) || c.title.en}`);
}

/**
 * Scrolling headline strip with today's real top stories, loaded in the browser.
 *
 * It sits on every page, so rendering it on the server tied every page (thousands of
 * story pages in two languages) to the 5-minute digest: each pipeline run changed
 * every page, and each crawler visit afterwards rebuilt and re-stored it (Vercel ISR
 * writes, 290K of the Hobby plan's 200K a month on 2026-10-20). The strip keeps its
 * height while empty, so filling it in moves nothing.
 */
export function Ticker({ lang }: { lang: Lang }) {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchTodayDigest()
      .then((digest) => {
        if (!cancelled) setItems(tickerItems(digest.featured, digest.topClusters, lang));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang]);
  const repeated = [...items, ...items];

  return (
    <div
      style={{
        background: "var(--accent)",
        color: "var(--ticker-text)",
        fontFamily: "var(--font-plex-mono), monospace",
        fontSize: "11px",
        fontWeight: 500,
        letterSpacing: ".06em",
        lineHeight: "16.5px",
        height: "28.5px",
        boxSizing: "border-box",
        padding: "6px 0",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
      aria-hidden="true"
    >
      {items.length > 0 ? (
        <div
          style={{
            display: "inline-block",
            animation: "ticker-scroll 50s linear infinite",
          }}
        >
          {repeated.map((item, i) => (
            <span key={i} style={{ margin: "0 40px" }}>
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
