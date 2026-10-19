/**
 * schema.org structured data for search engines and AI crawlers.
 * Pure builders over the API wire types; rendered by components/shared/json-ld.tsx.
 */

import type { ApiArchiveClusterRow, ApiCluster, ApiDigest } from "@/lib/api/types";
import type { Lang } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/routing";
import { siteCopy } from "@/lib/seo/copy";
import { SITE_NAME, SITE_URL, storyPath, storyUrl } from "@/lib/seo/site";

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

/** An absolute URL for a site path in ``lang`` ("/radar" → https://www.sipply.dev/zh/radar). */
function abs(path: string, lang: Lang): string {
  const localized = localePath(path, lang);
  return `${SITE_URL}${localized === "/" ? "/" : localized}`;
}

const LANG_TAG: Record<Lang, string> = { en: "en", zh: "zh-CN" };

/** The site itself, on every page: who publishes it and how to search it (the archive). */
export function websiteJsonLd(lang: Lang = "en"): JsonLd {
  const home = abs("/", lang);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...PUBLISHER, "@id": `${SITE_URL}/#organization` },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        name: SITE_NAME,
        url: home,
        description: siteCopy(lang).description,
        inLanguage: LANG_TAG[lang],
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${abs("/archive", lang)}?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** Where a page sits: Home › section › this page. ``path`` is site-relative. */
export function breadcrumbJsonLd(items: { name: string; path: string }[], lang: Lang = "en"): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: abs(item.path, lang),
    })),
  };
}

/** One story page: the Sipply summary, citing every source article it is based on. */
export function newsArticleJsonLd(c: ApiCluster, lang: Lang = "en"): JsonLd {
  const url = abs(storyPath(c), lang);
  const zh = lang === "zh";
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: clip((zh && c.title.zh) || c.title.en, 110),
    description: (zh && c.summary.zh) || c.summary.en || undefined,
    url,
    mainEntityOfPage: url,
    // The generated share card (app/[lang]/story/[slug]/opengraph-image.tsx), in English:
    // the card's fonts have no Chinese glyphs
    image: [`${storyUrl(c)}/opengraph-image`],
    datePublished: c.firstSeenAt ?? c.lastSeenAt ?? undefined,
    dateModified: c.lastSeenAt ?? c.firstSeenAt ?? undefined,
    inLanguage: LANG_TAG[lang],
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
export function digestItemListJsonLd(d: ApiDigest, lang: Lang = "en"): JsonLd {
  const seen = new Set<string>();
  const stories = [d.featured, ...d.topClusters].filter((c): c is ApiCluster => {
    if (!c || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: lang === "zh" ? "Sipply — 今日 AI 报道" : "Sipply — today's AI stories",
    description: siteCopy(lang).description,
    url: abs("/", lang),
    inLanguage: LANG_TAG[lang],
    numberOfItems: stories.length,
    itemListElement: stories.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: abs(storyPath(c), lang),
      name: (lang === "zh" && c.title.zh) || c.title.en,
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
  lang?: Lang;
}): JsonLd {
  const lang = page.lang ?? "en";
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url: abs(page.path, lang),
    inLanguage: LANG_TAG[lang],
    dateModified: page.dateModified ?? undefined,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: abs("/", lang) },
    publisher: PUBLISHER,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.stories.length,
      itemListElement: page.stories.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: abs(storyPath(s), lang),
        name: (lang === "zh" && s.title_zh) || s.title,
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
  lang?: Lang;
}): JsonLd {
  const lang = page.lang ?? "en";
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url: abs(page.path, lang),
    inLanguage: LANG_TAG[lang],
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: abs("/", lang) },
    publisher: PUBLISHER,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.items.length,
      itemListElement: page.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: abs(item.path, lang),
      })),
    },
  };
}

/** JSON for a <script> tag: "<" escaped so a title can never close the script element. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
