"use client";

import { useEffect, useState } from "react";
import { apiFetchAdmin } from "@/lib/api/client";
import type { ApiSipplyAnswers } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";

const L = {
  en: {
    title: "AI citations",
    subtitle:
      "Every Monday the questions behind the top 10 radar topics go to an AI assistant with web search. Editor-only: the public radar shows which sites it cites, never how Sipply did.",
    loading: "Loading…",
    loadFailed: "Failed to load:",
    none: "No answers checked yet. The check runs every Monday at 14:00 UTC.",
    cited: (cited: number, checks: number) => `Sipply cited in ${cited} of ${checks} answers`,
    read: (n: number) => `read (cited or not) in ${n}`,
    covered: (cited: number, covered: number) => `On topics Sipply had a story on: cited in ${cited} of ${covered}.`,
    topDomains: "Most-cited sites",
    recent: "Latest checks",
    pillCited: "✓ Cites Sipply",
    pillRead: "Read Sipply, didn't cite it",
    pillNot: "Doesn't cite Sipply",
    hasStory: "Sipply has a story",
    noStory: "No Sipply story",
    share: (pct: number) => `${pct}% of answers`,
  },
  zh: {
    title: "AI 引用",
    subtitle: "每周一把雷达上前 10 个话题对应的问题拿去问带网页搜索的 AI 助手。只给编辑看：公开的雷达页只显示它引用哪些网站，不显示 Sipply 的情况。",
    loading: "加载中…",
    loadFailed: "加载失败：",
    none: "还没有检查记录。每周一 UTC 14:00 检查一次。",
    cited: (cited: number, checks: number) => `${checks} 次回答里 Sipply 被引用 ${cited} 次`,
    read: (n: number) => `被读到（不论是否引用）${n} 次`,
    covered: (cited: number, covered: number) => `其中 Sipply 有报道的话题 ${covered} 次，被引用 ${cited} 次。`,
    topDomains: "被引用最多的网站",
    recent: "最近的检查",
    pillCited: "✓ 引用了 Sipply",
    pillRead: "读了 Sipply，但没引用",
    pillNot: "没有引用 Sipply",
    hasStory: "Sipply 有报道",
    noStory: "Sipply 没写",
    share: (pct: number) => `${pct}% 的回答`,
  },
} as const;

/** Admin: how often an AI assistant cites Sipply for the radar questions (GET /api/admin/radar/answers). */
export function AiCitationsClient() {
  const { lang } = useI18n();
  const t = L[lang];
  const [data, setData] = useState<ApiSipplyAnswers | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetchAdmin<ApiSipplyAnswers>("/api/admin/radar/answers?days=30")
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
      ) : data.checks === 0 ? (
        <p className="mt-6 text-sm [color:var(--text-muted)]">{t.none}</p>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="space-y-4">
            <div className="sp-glass p-5">
              <p className="text-2xl font-semibold text-foreground">{t.cited(data.sipplyCited, data.checks)}</p>
              <p className="mt-1 text-sm [color:var(--text-muted)]">{t.read(data.sipplyInSources)}</p>
              {data.sipplyCovered > 0 ? (
                <p className="mt-2 text-sm text-foreground">{t.covered(data.sipplyCitedWhenCovered, data.sipplyCovered)}</p>
              ) : null}
            </div>
            <div className="sp-glass p-5">
              <h2 className="text-sm font-semibold text-foreground">{t.topDomains}</h2>
              <ul className="mt-2 space-y-1.5">
                {data.topDomains.map((d) => (
                  <li key={d.domain} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <span className="truncate font-mono text-foreground" title={d.domain}>
                      {d.domain}
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full [background:var(--panel-divider)]">
                      <span
                        className={`block h-full rounded-full ${d.domain === "sipply.dev" ? "[background:var(--green)]" : "[background:var(--accent)]"}`}
                        style={{ width: `${Math.round(d.share * 100)}%` }}
                      />
                    </span>
                    <span className="text-right [color:var(--text-muted)]">{t.share(Math.round(d.share * 100))}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="sp-glass p-5">
            <h2 className="text-sm font-semibold text-foreground">{t.recent}</h2>
            <ul className="mt-2 sp-rows">
              {data.recent.map((r) => (
                <li key={`${r.checkedAt}-${r.question}`} className="py-2.5">
                  <p className="text-sm text-foreground">“{r.question}”</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs [color:var(--text-muted)]">
                    <span
                      className={`rounded-full border px-2 py-0.5 ${r.sipplyCited ? "[border-color:var(--green)] [color:var(--green)]" : "[border-color:var(--panel-edge-a)]"}`}
                    >
                      {r.sipplyCited ? t.pillCited : r.sipplyInSources ? t.pillRead : t.pillNot}
                    </span>
                    <span>{r.sipplyHasStory ? t.hasStory : t.noStory}</span>
                    <span className="font-mono">{r.citations.map((c) => c.domain).join(" · ")}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
