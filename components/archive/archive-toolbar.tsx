"use client";

import { useI18n } from "@/lib/i18n";
import { TOPIC_GROUPS, topicGroupLabel } from "@/lib/constants/topic-groups";
import { uiInput, uiTab } from "@/lib/ui/classes";

type ArchiveToolbarProps = {
  topic: string;
  onTopicChange: (topicKey: string) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
};

/** Sticky filter row: category tabs (one swipeable row on phones) + search. */
export function ArchiveToolbar({
  topic,
  onTopicChange,
  keyword,
  onKeywordChange,
}: ArchiveToolbarProps) {
  const { t, lang } = useI18n();

  return (
    <div
      className="sticky top-14 z-30 -mx-6 mb-8 flex flex-col gap-3 px-6 py-3 backdrop-blur-md [background:var(--masthead-bg)] sm:-mx-10 sm:flex-row sm:items-center sm:justify-between sm:px-10"
      role="toolbar"
      aria-label={t.archive.filterCategory}
    >
      <div className="sp-no-scrollbar -mx-6 flex gap-x-5 overflow-x-auto whitespace-nowrap px-6 pt-1 sm:mx-0 sm:flex-wrap sm:gap-y-2 sm:overflow-visible sm:px-0">
        <button type="button" aria-pressed={topic === ""} className={uiTab(topic === "")} onClick={() => onTopicChange("")}>
          {t.archive.allCategories}
        </button>
        {TOPIC_GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            aria-pressed={topic === g.key}
            className={uiTab(topic === g.key)}
            onClick={() => onTopicChange(g.key)}
          >
            {topicGroupLabel(g, lang)}
          </button>
        ))}
      </div>
      <input
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        placeholder={t.archive.searchPlaceholder}
        aria-label={t.archive.searchLabel}
        className={`${uiInput} w-full sm:w-[260px] sm:shrink-0`}
      />
    </div>
  );
}
