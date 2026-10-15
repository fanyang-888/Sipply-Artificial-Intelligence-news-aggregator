"use client";

import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n/types";
import type { LocalizedString } from "@/types/localized";
import { isBilingual, pickLocalized } from "@/lib/utils/localized-string";

/** In 中文 bilingual mode: EN is reference (lower contrast); ZH is reading focus. */
const enMuted = "[color:var(--text-muted)]";
const zhPrimary = "text-foreground";
/** Subtle left rule on the ZH block for long bilingual passages. */
const zhBlockContinuity = "border-l pl-3 sm:pl-3.5 [border-color:var(--panel-edge-a)]";

function splitParas(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

type BodyProps = {
  value: LocalizedString;
  lang: Lang;
  className?: string;
};

/** Single-language paragraphs from localized or bilingual field. */
export function LocalizedBody({
  value,
  lang,
  className = "space-y-3 text-sm leading-relaxed text-foreground",
}: BodyProps) {
  const text = pickLocalized(value, lang);
  const paras = splitParas(text);
  if (paras.length === 0) return null;
  return (
    <div className={className}>
      {paras.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

/** In zh mode with bilingual data: Chinese block first (primary), English block below (reference). */
export function BilingualAssistBody({
  value,
  lang,
  className = "space-y-3 text-sm leading-relaxed text-foreground",
}: BodyProps) {
  if (lang !== "zh" || !isBilingual(value) || !value.zh) {
    return <LocalizedBody value={value} lang={lang} className={className} />;
  }
  const zhParas = splitParas(value.zh);
  const enParas = splitParas(value.en);
  if (zhParas.length === 0) {
    return <LocalizedBody value={value} lang="en" className={className} />;
  }
  return (
    <div className={className}>
      <div className={`space-y-3 ${zhPrimary}`}>
        {zhParas.map((p, i) => (
          <p key={`zh-${i}`}>{p}</p>
        ))}
      </div>
      <div
        className={`mt-4 space-y-3 text-[0.92em] ${enMuted} ${zhBlockContinuity}`}
      >
        {enParas.map((p, i) => (
          <p key={`en-${i}`}>{p}</p>
        ))}
      </div>
    </div>
  );
}

type TakeawayProps = {
  value: LocalizedString;
  lang: Lang;
};

export function BilingualAssistTakeawayItem({ value, lang }: TakeawayProps) {
  if (lang !== "zh" || !isBilingual(value) || !value.zh) {
    return <>{pickLocalized(value, lang)}</>;
  }
  return (
    <div className="space-y-2">
      <p className={zhPrimary}>{value.zh}</p>
      <p className={`text-[0.92em] ${enMuted} ${zhBlockContinuity}`}>
        {value.en}
      </p>
    </div>
  );
}

/** Page title: ZH first (primary), EN below (muted reference) in Chinese mode. */
export function BilingualAssistHeading({
  value,
  lang,
}: {
  value: LocalizedString;
  lang: Lang;
}) {
  if (lang !== "zh" || !isBilingual(value) || !value.zh) {
    return <>{pickLocalized(value, lang)}</>;
  }
  return (
    <>
      <span className={`block ${zhPrimary}`}>{value.zh}</span>
      <span className={`mt-4 block text-[0.5em] font-normal leading-snug tracking-normal ${enMuted}`}>{value.en}</span>
    </>
  );
}

/** Subtitle / secondary line under page title (smaller type). */
export function BilingualAssistSubline({
  value,
  lang,
}: {
  value: LocalizedString;
  lang: Lang;
}) {
  if (lang !== "zh" || !isBilingual(value) || !value.zh) {
    return <>{pickLocalized(value, lang)}</>;
  }
  return (
    <>
      <span className="block">{value.zh}</span>
      <span className={`mt-1 block text-[0.9em] ${enMuted}`}>{value.en}</span>
    </>
  );
}

type BilingualTrustNoteProps = {
  children: ReactNode;
};

/** One quiet line in Chinese UI mode on story pages (bilingual assist disclaimer). */
export function BilingualTrustNote({ children }: BilingualTrustNoteProps) {
  return (
    <p className="font-mono text-[11px] leading-relaxed tracking-[0.04em] [color:var(--text-muted)]" role="note">
      {children}
    </p>
  );
}
