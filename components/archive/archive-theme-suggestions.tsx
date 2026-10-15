"use client";

import { useI18n } from "@/lib/i18n";
import { TOPIC_GROUPS, topicGroupLabel } from "@/lib/constants/topic-groups";

type ArchiveTopicSuggestionsProps = {
  onPickTopic: (topicKey: string) => void;
  /** Currently selected topic — omitted from the chips (clicking it would be a no-op). */
  activeTopic?: string;
};

export function ArchiveThemeSuggestions({
  onPickTopic,
  activeTopic,
}: ArchiveTopicSuggestionsProps) {
  const { t, lang } = useI18n();

  return (
    <div className="text-center">
      <p className="text-sm [color:var(--text-soft)]">{t.archive.suggestThemesLead}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {TOPIC_GROUPS.filter((g) => g.key !== activeTopic).map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => onPickTopic(g.key)}
            className="sp-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]"
          >
            {topicGroupLabel(g, lang)}
          </button>
        ))}
      </div>
    </div>
  );
}
