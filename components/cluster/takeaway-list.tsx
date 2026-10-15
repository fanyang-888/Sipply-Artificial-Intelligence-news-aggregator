"use client";

import { BilingualAssistTakeawayItem } from "@/components/shared/bilingual-assist-text";
import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import type { LocalizedString } from "@/types/localized";

type TakeawayListProps = {
  items: LocalizedString[];
};

/** Numbered takeaways: a mono number in the margin, the point beside it. */
export function TakeawayList({ items }: TakeawayListProps) {
  const { t, lang } = useI18n();

  return (
    <section aria-labelledby="story-takeaways">
      <SectionTitle id="story-takeaways">{t.cluster.takeaways}</SectionTitle>
      <ol className="sp-rows text-[15.5px] leading-relaxed text-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex gap-5 py-4">
            <span className="w-6 shrink-0 pt-[3px] font-mono text-[11px] tabular-nums [color:var(--accent)]" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <BilingualAssistTakeawayItem value={item} lang={lang} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
