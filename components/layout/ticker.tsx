import { getDigest } from "@/lib/api/server";
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

/** Scrolling headline strip with today's real top stories; hidden when the digest can't be loaded. */
export async function Ticker({ lang }: { lang: Lang }) {
  let items: string[] = [];
  try {
    const digest = await getDigest();
    items = tickerItems(digest.featured, digest.topClusters, lang);
  } catch {
    return null;
  }
  if (items.length === 0) return null;
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
        padding: "6px 0",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
      aria-hidden="true"
    >
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
    </div>
  );
}
