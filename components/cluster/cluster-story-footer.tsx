"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/utils/localized-string";
import { uiButtonSecondary, uiMicroLabel, uiTextLinkPrimary } from "@/lib/ui/classes";
import type { Cluster } from "@/types/cluster";
import { storyPath } from "@/lib/seo/site";

type ClusterStoryFooterProps = {
  /** The story after this one in today's digest. */
  next: Cluster | undefined;
  /** False when this story isn't in today's digest (an older story, or a shared link). */
  inDigest: boolean;
};

/**
 * The way onward: the next story in today's order as one card; "all caught
 * up" only when this really was today's last story; otherwise today's stories.
 */
export function ClusterStoryFooter({ next, inDigest }: ClusterStoryFooterProps) {
  const { t, lang } = useI18n();

  return (
    <footer className="border-t pt-10 [border-color:var(--panel-divider)]">
      {next ? (
        <Link href={storyPath(next)} className="sp-glass group block p-6 no-underline sm:p-8">
          <span className={uiMicroLabel}>{t.cluster.nextStory}</span>
          <span className="mt-3 block font-display text-[clamp(1.4rem,2.4vw,1.9rem)] leading-tight text-foreground transition-colors group-hover:[color:var(--accent)] [text-wrap:balance]">
            {pickLocalized(next.title, lang)} <span aria-hidden>→</span>
          </span>
        </Link>
      ) : inDigest ? (
        <p className="text-[15px] [color:var(--text-soft)]">
          {t.cluster.allCaughtUpToday}{" "}
          <Link href="/archive" className={uiTextLinkPrimary}>
            {t.cluster.caughtUpViewArchive} <span aria-hidden>→</span>
          </Link>
        </p>
      ) : (
        <Link href="/#today" className="sp-glass group block p-6 no-underline sm:p-8">
          <span className={uiMicroLabel}>{t.cluster.moreToday}</span>
          <span className="mt-3 block font-display text-[clamp(1.3rem,2.2vw,1.7rem)] leading-tight text-foreground transition-colors group-hover:[color:var(--accent)]">
            {t.home.todayTitle} {t.home.todaySubtitle} <span aria-hidden>→</span>
          </span>
        </Link>
      )}
      <div className="mt-6">
        <Link href="/" className={uiButtonSecondary}>
          <span aria-hidden>←</span> {t.cluster.backToDigest}
        </Link>
      </div>
    </footer>
  );
}
