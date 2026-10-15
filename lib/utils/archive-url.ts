/** Query keys: q, topic (topic group key) */

import { isTopicGroupKey, type TopicGroupKey } from "@/lib/constants/topic-groups";

export type ArchiveQuery = {
  q: string;
  topic: string;
};

function normalizeTopic(raw: string | null): string {
  const v = (raw ?? "").trim();
  return isTopicGroupKey(v) ? v : "";
}

export function parseArchiveQuery(
  searchParams: Pick<URLSearchParams, "get">,
): ArchiveQuery {
  return {
    q: searchParams.get("q") ?? "",
    topic: normalizeTopic(searchParams.get("topic")),
  };
}

export function serializeArchiveQuery(params: ArchiveQuery): string {
  const u = new URLSearchParams();
  const q = params.q.trim();
  if (q) u.set("q", q);
  if (params.topic) u.set("topic", params.topic);
  return u.toString();
}

/** Stories per page in the archive list (server-rendered first page and "load more"). */
export const ARCHIVE_PAGE_SIZE = 20;

export function archiveHref(params: ArchiveQuery): string {
  const qs = serializeArchiveQuery(params);
  return qs ? `/archive?${qs}` : "/archive";
}

/** Deep link from the homepage category bar: filter archive by topic group only. */
export function archiveTopicHref(topic: TopicGroupKey): string {
  return archiveHref({ q: "", topic });
}
