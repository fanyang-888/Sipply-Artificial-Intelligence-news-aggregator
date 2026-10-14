"use client";

import { NotFoundState } from "@/components/shared/not-found-state";
import { useI18n } from "@/lib/i18n";

/** Story not found, in the reader's language (the only kind of not-found page so far). */
export function LocalizedNotFound() {
  const { t } = useI18n();

  return (
    <NotFoundState title={t.notFound.clusterTitle} message={t.notFound.clusterMessage} />
  );
}
