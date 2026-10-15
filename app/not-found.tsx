"use client";

import { NotFoundState } from "@/components/shared/not-found-state";
import { useI18n } from "@/lib/i18n";

/** Any URL that matches no route, in the reader's language. */
export default function NotFound() {
  const { t } = useI18n();
  return <NotFoundState title={t.notFound.pageTitle} message={t.notFound.pageMessage} />;
}
