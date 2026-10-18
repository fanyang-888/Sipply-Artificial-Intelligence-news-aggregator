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

/** The site itself, on every page: who publishes it and how to search it (the archive). */
export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...PUBLISHER, "@id": `${SITE_URL}/#organization` },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: ["en", "zh"],
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/archive?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** Where a page sits: Home › section › this page. ``path`` is site-relative. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/** One story page: the Sipply summary, citing every source article it is based on. */
export function newsArticleJsonLd(c: ApiCluster): JsonLd {
  const url = storyUrl(c);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: clip(c.title.en, 110),
    description: c.summary.en || undefined,
    url,
    mainEntityOfPage: url,
    // The generated share card (app/story/[slug]/opengraph-image.tsx)
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
      url: storyUrl(c),
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
        url: storyUrl(s),
        name: s.title,
      })),
    },
  };
}

/** A hub index (companies, weeks): a collection whose main entity is its list of hub pages. */
export function pageListJsonLd(page: {
  name: string;
  description: string;
  path: string;
  items: { name: string; path: string }[];
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url: `${SITE_URL}${page.path}`,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    publisher: PUBLISHER,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.items.length,
      itemListElement: page.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: `${SITE_URL}${item.path}`,
      })),
    },
  };
}

/** JSON for a <script> tag: "<" escaped so a title can never close the script element. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
