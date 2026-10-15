"use client";

import { useEffect, useState } from "react";
import { apiFetchAdmin } from "@/lib/api/client";
import type { ApiRadarGaps } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { radarTitle } from "@/lib/utils/radar";
import { RadarContentBrief } from "@/components/radar/radar-content-brief";

const L = {
  en: {
    title: "Content gaps",
    subtitle: "Trend Radar topics Sipply has no story on yet: editor-only, never shown on the public radar.",
    summary: (gaps: number, checked: number) =>
      `${gaps} of the ${checked} mainstream and picking-up topics have no Sipply story.`,
    loading: "Loading…",
    loadFailed: "Failed to load:",
    none: "No gaps: Sipply has a story on every mainstream and picking-up topic.",
    ring: { 1: "Mainstream", 2: "Picking up", 3: "Weak signal" } as Record<number, string>,
    signals: (n: number) => `${n} signals`,
    question: "Readers ask",
    briefPending: "Brief pending: written on the next data run.",
    posts: "Top posts",
  },
  zh: {
    title: "内容缺口",
    subtitle: "Sipply 还没写的趋势雷达话题：只给编辑看，不会出现在公开的雷达页。",
    summary: (gaps: number, checked: number) => `主流和发酵中的 ${checked} 个话题里，Sipply 有 ${gaps} 个还没写。`,
    loading: "加载中…",
    loadFailed: "加载失败：",
    none: "没有缺口：主流和发酵中的话题 Sipply 都写了。",
    ring: { 1: "主流", 2: "发酵中", 3: "弱信号" } as Record<number, string>,
    signals: (n: number) => `${n} 条信号`,
    question: "读者会问",
    briefPending: "简报待生成：下一次数据更新时写。",
    posts: "互动最多的帖子",
  },
} as const;

/** Admin: the radar's content gaps with their briefs (GET /api/admin/radar/gaps). */
export function GapsClient() {
  const { lang } = useI18n();
  const t = L[lang];
  const [data, setData] = useState<ApiRadarGaps | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetchAdmin<ApiRadarGaps>("/api/admin/radar/gaps")
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="font-display text-[2rem] font-light leading-tight text-foreground">{t.title}</h1>
      <p className="mt-1 text-sm [color:var(--text-muted)]">{t.subtitle}</p>

      {error ? (
        <p className="mt-6 text-sm [color:var(--red)]">
          {t.loadFailed} {error}
        </p>
      ) : !data ? (
        <p className="mt-6 text-sm [color:var(--text-muted)]">{t.loading}</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-foreground">{t.summary(data.topics.length, data.checked)}</p>
          {data.topics.length === 0 ? (
            <p className="mt-6 text-sm [color:var(--text-muted)]">{t.none}</p>
          ) : (
            <ol className="mt-4 space-y-4">
              {data.topics.map((topic) => {
                const summary = lang === "zh" ? topic.summaryZh ?? topic.summaryEn : topic.summaryEn;
                return (
                  <li key={topic.id} className="sp-glass p-5">
                    <p className="text-xs [color:var(--text-muted)]">
                      {t.ring[topic.ring]} · {t.signals(topic.signalCount)} · {Math.round(topic.score)}/100
                    </p>
                    <h2 className="mt-1 text-[16px] font-semibold leading-snug text-foreground">
                      {radarTitle(topic.label, topic.labelZh, lang)}
                    </h2>
                    {summary ? <p className="mt-1 text-sm [color:var(--text-soft)]">{summary}</p> : null}
                    {topic.question ? (
                      <p className="mt-1 text-sm [color:var(--text-soft)]">
                        <span className="[color:var(--text-muted)]">{t.question}: </span>“{topic.question}”
                      </p>
                    ) : null}
                    <div className="mt-3">
                      {topic.brief ? (
                        <RadarContentBrief brief={topic.brief} />
                      ) : (
                        <p className="text-sm [color:var(--text-muted)]">{t.briefPending}</p>
                      )}
                    </div>
                    {topic.signals.length > 0 ? (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer [color:var(--text-muted)] hover:text-foreground">{t.posts}</summary>
                        <ul className="mt-1.5 space-y-1">
                          {topic.signals.map((s) => (
                            <li key={s.id}>
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
                                {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
