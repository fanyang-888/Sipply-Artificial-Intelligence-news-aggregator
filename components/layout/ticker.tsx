import { getDigest } from "@/lib/api/server";
import type { ApiCluster } from "@/lib/api/types";

const MAX_ITEMS = 8;

/** "CATEGORY · headline" for today's top stories (decorative; the stories themselves are in the page). */
export function tickerItems(featured: ApiCluster | null, top: ApiCluster[]): string[] {
  const seen = new Set<string>();
  return [featured, ...top]
    .filter((c): c is ApiCluster => {
      if (!c || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .slice(0, MAX_ITEMS)
    .map((c) => `${(c.topicTag ?? "AI").toUpperCase()} · ${c.title.en}`);
}

/** Scrolling headline strip with today's real top stories; hidden when the digest can't be loaded. */
export async function Ticker() {
  let items: string[] = [];
  try {
    const digest = await getDigest();
    items = tickerItems(digest.featured, digest.topClusters);
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
