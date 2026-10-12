"use client";

import { NotFoundState } from "@/components/shared/not-found-state";
import { useI18n } from "@/lib/i18n";

type LocalizedNotFoundProps = {
  variant: "cluster";
};

export function LocalizedNotFound({ variant }: LocalizedNotFoundProps) {
  const { t } = useI18n();

  return (
    <NotFoundState title={t.notFound.clusterTitle} message={t.notFound.clusterMessage} />
  );
}
