"use client";

import type { ApiRadarAnswers, ApiRadarTopic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { RelativeAge } from "@/components/radar/radar-bits";
import { uiMicroLabel, uiSectionTitle } from "@/lib/ui/classes";

const label = uiMicroLabel;

/**
 * On a topic card: the reader's question and what an AI assistant with web
 * search cited. Nothing until the question has been checked at least once.
 */
export function TopicAnswerCheck({ topic, now }: { topic: ApiRadarTopic; now: number | null }) {
  const { t } = useI18n();
  const check = topic.answerCheck;
  if (!topic.question || !check) return null;
  return (
    <section>
      <h3 className={`${label} mb-1.5`}>{t.radar.answerLabel}</h3>
      <p className="text-[14px] leading-snug text-foreground">
        <span className="[color:var(--text-muted)]">{t.radar.answerQuestion}: </span>“{topic.question}”
      </p>
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] [color:var(--text-muted)]">
          <span>{t.radar.answerSources(check.citations.length, check.sourceCount)}</span>
          <RelativeAge iso={check.checkedAt} now={now} />
        </div>
        <ol className="list-decimal space-y-0.5 pl-5 text-[13px]">
          {check.citations.map((c) => (
            <li key={c.url} className="[overflow-wrap:anywhere]">
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:[color:var(--accent)]">
                {c.title || c.url}
              </a>{" "}
              <span className="font-mono text-[11px] [color:var(--text-muted)]">{c.domain}</span>
            </li>
          ))}
        </ol>
        <p className="text-[11px] [color:var(--text-muted)]">{t.radar.answerNote(check.model)}</p>
      </div>
    </section>
  );
}

/**
 * Page section: which sites AI assistants cite for the radar's questions.
 * Whether they cite Sipply is the editor's business (admin → AI citations),
 * not this page's. Hidden until there is a check.
 */
export function RadarAnswersSection({ answers, now }: { answers: ApiRadarAnswers | null; now: number | null }) {
  const { t } = useI18n();
  if (!answers || answers.checks === 0) return null;
  return (
    <section aria-labelledby="radar-answers-title">
      <h2 id="radar-answers-title" className={`${uiSectionTitle} mb-1`}>
        {t.radar.answersTitle}
      </h2>
      <p className="mb-5 max-w-3xl text-[13px] [color:var(--text-muted)]">{t.radar.answersDesc}</p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-foreground">
            {t.radar.answersStats({ checks: answers.checks, questions: answers.questions, days: answers.days })}
          </p>
          <div>
            <h3 className={`${label} mb-1.5`}>{t.radar.answersTopDomains}</h3>
            <ul className="space-y-1">
              {answers.topDomains.map((d) => (
                <li key={d.domain} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2 text-[12.5px]">
                  <span className="truncate font-mono text-foreground" title={d.domain}>
                    {d.domain}
                  </span>
                  <span className="h-[6px] overflow-hidden rounded-full [background:var(--panel-divider)]">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.round(d.share * 100)}%`, background: d.domain === "sipply.dev" ? "var(--green)" : "var(--accent)" }}
                    />
                  </span>
                  <span className="text-right text-[11px] [color:var(--text-muted)]">{t.radar.answersShare(Math.round(d.share * 100))}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className={`${label} mb-1.5`}>{t.radar.answersRecent}</h3>
          <ul className="sp-glass sp-rows px-5 py-1">
            {answers.recent.map((r) => (
              <li key={`${r.checkedAt}-${r.question}`} className="py-3">
                <p className="text-[13.5px] leading-snug text-foreground">“{r.question}”</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] [color:var(--text-muted)]">
                  <span className="font-mono">{r.citations.map((c) => c.domain).join(" · ")}</span>
                  <RelativeAge iso={r.checkedAt} now={now} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
