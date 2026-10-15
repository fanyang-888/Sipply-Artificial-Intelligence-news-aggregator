/**
 * schema.org structured data for search engines and AI crawlers.
 * Pure builders over the API wire types; rendered by components/shared/json-ld.tsx.
 */

import type { ApiArchiveClusterRow, ApiCluster, ApiDigest } from "@/lib/api/types";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, storyUrl } from "@/lib/seo/site";

type JsonLd = Record<string, unknown>;

const PUBLISHER: JsonLd = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
};

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** One story page: the Sipply summary, citing every source article it is based on. */
export function newsArticleJsonLd(c: ApiCluster): JsonLd {
  const url = storyUrl(c.id);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: clip(c.title.en, 110),
    description: c.summary.en || undefined,
    url,
    mainEntityOfPage: url,
    // The generated share card (app/cluster/[id]/opengraph-image.tsx)
    image: [`${url}/opengraph-image`],
    datePublished: c.firstSeenAt ?? c.lastSeenAt ?? undefined,
    dateModified: c.lastSeenAt ?? c.firstSeenAt ?? undefined,
    inLanguage: "en",
    articleSection: c.topicTag ?? undefined,
    keywords: c.tags.length ? c.tags.join(", ") : undefined,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: PUBLISHER,
    isBasedOn: c.articles.map((a) => a.url),
    citation: c.articles.map((a) => ({
      "@type": "NewsArticle",
      headline: a.title,
      url: a.url,
      datePublished: a.publishedAt ?? undefined,
      publisher: a.sourceName ? { "@type": "Organization", name: a.sourceName } : undefined,
    })),
  };
}

/** Today's digest as an ordered list of story pages. */
export function digestItemListJsonLd(d: ApiDigest): JsonLd {
  const seen = new Set<string>();
  const stories = [d.featured, ...d.topClusters].filter((c): c is ApiCluster => {
    if (!c || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Sipply — today's AI stories",
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/`,
    numberOfItems: stories.length,
    itemListElement: stories.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: storyUrl(c.id),
      name: c.title.en,
    })),
  };
}

/** A topic or weekly page: a collection whose main entity is its list of story pages. */
export function collectionPageJsonLd(page: {
  name: string;
  description: string;
  path: string;
  stories: ApiArchiveClusterRow[];
  dateModified?: string | null;
}): JsonLd {
  const url = `${SITE_URL}${page.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url,
    inLanguage: "en",
    dateModified: page.dateModified ?? undefined,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    publisher: PUBLISHER,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.stories.length,
      itemListElement: page.stories.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: storyUrl(s.id),
        name: s.title,
      })),
    },
  };
}

/** JSON for a <script> tag: "<" escaped so a title can never close the script element. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
