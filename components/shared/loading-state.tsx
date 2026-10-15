"use client";

import { useI18n } from "@/lib/i18n";

export type LoadingLayout = "digest" | "archive" | "detail";

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl [background:var(--panel-fill-2)] ${className}`}
      aria-hidden
    />
  );
}

type LoadingStateProps = {
  layout: LoadingLayout;
};

/**
 * Skeletons in the shape of what is loading (glass panels, headline lines).
 */
export function LoadingState({ layout }: LoadingStateProps) {
  const { t } = useI18n();
  const label =
    layout === "archive"
      ? t.archive.loading
      : layout === "digest"
        ? t.loading.digest
        : t.loading.detail;

  if (layout === "archive") {
    // Day groups of rows, as the archive and hub lists render them
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <p className="sr-only">{label}</p>
        {[3, 2].map((rows, g) => (
          <div key={g} className="sp-glass sp-rows overflow-hidden">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex gap-5 px-5 py-4">
                <Skeleton className="mt-1 hidden h-3 w-20 sm:block" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (layout === "digest") {
    // The lead story's shape: label, a two-line headline, a paragraph
    return (
      <div className="space-y-5 pt-[12vh]" aria-busy="true" aria-live="polite">
        <p className="sr-only">{label}</p>
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-14 w-full max-w-3xl" />
        <Skeleton className="h-14 w-2/3 max-w-2xl" />
        <Skeleton className="mt-4 h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-4/5 max-w-lg" />
      </div>
    );
  }

  // A story page: label, headline, meta line, then the summary panel
  return (
    <div className="mx-auto max-w-3xl space-y-5 pt-10" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-3 w-64" />
      <div className="sp-glass mt-8 space-y-3 p-6">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
