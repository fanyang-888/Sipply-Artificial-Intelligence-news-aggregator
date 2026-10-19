import type { Metadata } from "next";
import { Suspense } from "react";
import { ArchivePageClient } from "@/app/[lang]/archive/archive-page-client";
import { ArchiveLoadingFallback } from "@/components/archive/archive-loading-fallback";
import { JsonLd } from "@/components/shared/json-ld";
import { getLatestStories } from "@/lib/api/server";
import { asLang, sectionCopy, sectionMetadata } from "@/lib/seo/copy";
import { collectionPageJsonLd } from "@/lib/seo/json-ld";
import { ARCHIVE_PAGE_SIZE } from "@/lib/utils/archive-url";

// Rendered per request, not prerendered: the client list reads the URL's
// search params, and in a static render that bails out to the Suspense
// fallback, so the prerendered HTML carried no stories (checked on the live
// site). The story data itself is still cached for 5 minutes in the fetch
// cache, so a request costs one cheap function call.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return sectionMetadata("archive", "/archive", asLang((await params).lang));
}

export default async function ArchivePage({ params }: Props) {
  const lang = asLang((await params).lang);
  const copy = sectionCopy("archive", lang);
  // The newest page of stories is in the HTML; the browser takes over for search, filters and paging
  const initial = await getLatestStories(ARCHIVE_PAGE_SIZE).catch(() => null);
  const result = initial?.result ?? null;
  return (
    <>
      {result ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: `Sipply: ${copy.title}`,
            description: copy.description,
            path: "/archive",
            lang,
            stories: result.clusters,
            dateModified: result.clusters[0]?.lastSeenAt,
          })}
        />
      ) : null}
      <Suspense fallback={<ArchiveLoadingFallback />}>
        <ArchivePageClient initial={initial} />
      </Suspense>
    </>
  );
}
