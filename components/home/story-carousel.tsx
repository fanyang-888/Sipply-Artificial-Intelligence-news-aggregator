"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SourceLink } from "@/components/digest/source-link";
import { RelativeAge } from "@/components/radar/radar-bits";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { usePreferredRole } from "@/lib/preferred-role";
import { useNowMinute } from "@/lib/use-now-minute";
import { pickLocalized } from "@/lib/utils/localized-string";
import { topicGroupForTag } from "@/lib/utils/radar";
import type { Cluster } from "@/types/cluster";

function StoryCard({ story, now }: { story: Cluster; now: number | null }) {
  const { t, lang } = useI18n();
  const [role] = usePreferredRole();
  const group = story.topicTag ? topicGroupForTag(story.topicTag) : null;
  const category = group ? topicGroupByKey(group) : undefined;
  const angle = (role && pickLocalized(story.audience[role], lang)) || pickLocalized(story.whyItMatters, lang);
  return (
    <article className="sp-glass flex h-full flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.14em] [color:var(--text-muted)]">
        <span>{category ? topicGroupLabel(category, lang) : story.topicTag ?? ""}</span>
        <span className="normal-case tracking-[0.04em]">
          <RelativeAge iso={story.lastSeenAt} now={now} />
        </span>
      </div>
      <h3
        className="font-display font-light mt-5 text-[clamp(1.4rem,2.3vw,1.95rem)] leading-[1.14] tracking-[-0.015em] text-foreground line-clamp-3 [text-wrap:balance]"
      >
        <Link href={`/cluster/${story.id}`} className="no-underline hover:opacity-90">
          {pickLocalized(story.title, lang)}
        </Link>
      </h3>
      <p className="mt-4 text-[15px] leading-relaxed [color:var(--text-soft)] line-clamp-3">{pickLocalized(story.summary, lang)}</p>
      {angle ? (
        <p className="mt-4 border-l-2 pl-3 text-[14px] leading-relaxed text-foreground line-clamp-3 [border-color:var(--accent)]">
          {angle}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-7">
        <Link href={`/cluster/${story.id}`} className="text-[14px] font-medium text-foreground no-underline hover:[color:var(--accent)]">
          {t.home.readStory} <span aria-hidden>→</span>
        </Link>
        <SourceLink cluster={story} />
      </div>
    </article>
  );
}

type StoryCarouselProps = {
  stories: Cluster[];
  label: string;
  /** "All stories" destination for the current category. */
  moreHref: string;
};

/**
 * Today's stories as one large card at a time, swiped or stepped sideways.
 * Native horizontal scroll with a snap per card (the page's vertical scroll is
 * never captured); arrows, ←/→ on the focused track and touch all move it, and
 * the counter follows whatever the scroll position is.
 */
export function StoryCarousel({ stories, label, moreHref }: StoryCarouselProps) {
  const { t } = useI18n();
  const now = useNowMinute();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = stories.length;

  // The card nearest the track's centre is the current one
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const centre = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    Array.from(track.children).forEach((child, i) => {
      const el = child as HTMLElement;
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centre);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setIndex(best);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure]);

  // A new list (category or role change) starts from the first card
  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 });
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [stories, measure]);

  const go = (target: number) => {
    const track = trackRef.current;
    const card = track?.children[Math.max(0, Math.min(count - 1, target))] as HTMLElement | undefined;
    if (!track || !card) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    }
  };

  const arrow =
    "grid h-9 w-9 place-items-center rounded-full text-[15px] text-foreground transition-colors hover:[background:var(--panel-fill-2)] disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <div
        ref={trackRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={t.home.carouselKeysHint}
        className="sp-carousel -mx-6 flex gap-4 overflow-x-auto px-[calc((100%+3rem-min(40rem,86vw))/2)] pb-4 pt-1 sm:px-[calc((100%+5rem-min(40rem,86vw))/2)] outline-none focus-visible:ring-1 focus-visible:[--tw-ring-color:var(--accent)] sm:-mx-10 sm:gap-6 [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)]"
      >
        {stories.map((story, i) => (
          <div
            key={story.id}
            role="group"
            aria-roledescription="slide"
            aria-label={t.home.slideLabel(i + 1, count)}
            className="w-[min(40rem,86vw)] shrink-0 transition-opacity duration-300"
            style={{ opacity: i === index ? 1 : 0.55 }}
          >
            <StoryCard story={story} now={now} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center">
        <div className="sp-glass inline-flex items-center gap-1 rounded-full px-1.5 py-1.5">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t.home.prevStory} className={arrow}>
            ‹
          </button>
          <span className="min-w-[4.5rem] text-center font-mono text-[12px] tabular-nums text-foreground" aria-live="polite">
            {count > 0 ? index + 1 : 0} / {count}
          </span>
          <button type="button" onClick={() => go(index + 1)} disabled={index >= count - 1} aria-label={t.home.nextStory} className={arrow}>
            ›
          </button>
          <span className="mx-1 h-4 w-px [background:var(--border)]" aria-hidden />
          <Link href={moreHref} className="rounded-full px-3 py-1.5 text-[12.5px] no-underline [color:var(--text-muted)] hover:text-foreground">
            {t.home.allStories} <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
