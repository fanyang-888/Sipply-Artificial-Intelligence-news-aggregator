import type { Metadata } from "next";
import { Suspense } from "react";
import { ArchivePageClient } from "@/app/archive/archive-page-client";
import { ArchiveLoadingFallback } from "@/components/archive/archive-loading-fallback";
import { JsonLd } from "@/components/shared/json-ld";
import { getLatestStories } from "@/lib/api/server";
import { collectionPageJsonLd } from "@/lib/seo/json-ld";
import { ARCHIVE_PAGE_SIZE } from "@/lib/utils/archive-url";

// Rendered per request, not prerendered: the client list reads the URL's
// search params, and in a static render that bails out to the Suspense
// fallback, so the prerendered HTML carried no stories (checked on the live
// site). The story data itself is still cached for 5 minutes in the fetch
// cache, so a request costs one cheap function call.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Every AI story Sipply has synthesized, newest first: searchable by keyword and filtered by category (models, research, funding, products, policy & safety, open source & infra).";

export const metadata: Metadata = {
  title: "Archive: every AI story",
  description: DESCRIPTION,
  alternates: { canonical: "/archive" },
  openGraph: { siteName: "Sipply", title: "Sipply archive: every AI story", description: DESCRIPTION, url: "/archive" },
};

export default async function ArchivePage() {
  // The newest page of stories is in the HTML; the browser takes over for search, filters and paging
  const initial = await getLatestStories(ARCHIVE_PAGE_SIZE).catch(() => null);
  const result = initial?.result ?? null;
  return (
    <>
      {result ? (
        <JsonLd
          data={collectionPageJsonLd({
            name: "Sipply archive: every AI story",
            description: DESCRIPTION,
            path: "/archive",
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
