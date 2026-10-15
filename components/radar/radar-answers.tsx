"use client";

import type { ApiRadarAnswers, ApiRadarTopic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { RelativeAge } from "@/components/radar/radar-bits";

const label = "text-[13px] font-semibold text-foreground";

function CitedPill({ cited, read }: { cited: boolean; read: boolean }) {
  const { t } = useI18n();
  const text = cited ? t.radar.answerCited : read ? t.radar.answerReadNotCited : t.radar.answerNotCited;
  return (
    <span
      className="rounded-full border px-2.5 py-0.5 text-xs"
      style={{
        color: cited ? "var(--green)" : "var(--text-muted)",
        borderColor: cited ? "var(--green)" : "var(--border)",
      }}
    >
      {cited ? "✓ " : ""}
      {text}
    </span>
  );
}

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
          <CitedPill cited={check.sipplyCited} read={check.sipplyInSources} />
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

/** Page section: how often assistants cite Sipply, and who they cite instead. Hidden until there is a check. */
export function RadarAnswersSection({ answers, now }: { answers: ApiRadarAnswers | null; now: number | null }) {
  const { t } = useI18n();
  if (!answers || answers.checks === 0) return null;
  return (
    <section aria-labelledby="radar-answers-title">
      <h2 id="radar-answers-title" className="text-lg font-semibold text-foreground">
        {t.radar.answersTitle}
      </h2>
      <p className="mb-3 mt-1 max-w-3xl text-xs [color:var(--text-muted)]">{t.radar.answersDesc}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-foreground">
            {t.radar.answersStats({ checks: answers.checks, questions: answers.questions, cited: answers.sipplyCited, days: answers.days })}{" "}
            {answers.sipplyCovered > 0 ? t.radar.answersCoveredStat(answers.sipplyCovered, answers.sipplyCitedWhenCovered) : null}
          </p>
          <div>
            <h3 className={`${label} mb-1.5`}>{t.radar.answersTopDomains}</h3>
            <ul className="space-y-1">
              {answers.topDomains.map((d) => (
                <li key={d.domain} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2 text-[12.5px]">
                  <span className="truncate font-mono text-foreground" title={d.domain}>
                    {d.domain}
                  </span>
                  <span className="h-[6px] overflow-hidden rounded-full [background:var(--border)]">
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
          <ul className="rounded-[10px] border px-3.5 py-1 [background:var(--surface)] [border-color:var(--border)]">
            {answers.recent.map((r) => (
              <li key={`${r.checkedAt}-${r.question}`} className="border-b py-2 last:border-b-0 [border-color:var(--border)]">
                <p className="text-[13.5px] leading-snug text-foreground">“{r.question}”</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] [color:var(--text-muted)]">
                  <CitedPill cited={r.sipplyCited} read={false} />
                  <span>{r.sipplyHasStory ? t.radar.answersHasStory : t.radar.answersNoStory}</span>
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
