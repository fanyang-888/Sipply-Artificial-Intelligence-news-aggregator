"use client";

import { BilingualAssistBody } from "@/components/shared/bilingual-assist-text";
import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import { ROLES, roleLabel, usePreferredRole, type Role } from "@/lib/preferred-role";
import type { AudienceBlocks } from "@/types/cluster";
import type { LocalizedString } from "@/types/localized";

type WhyItMattersSectionProps = {
  overview: LocalizedString;
  audience: AudienceBlocks;
};

/**
 * The general "why it matters", then one paragraph per reader role. With no
 * role picked (most readers) all three show; with one picked (here or on the
 * home page) that paragraph comes first and the others fold away. Folded text
 * stays in the HTML, so crawlers still read all three.
 */
export function WhyItMattersSection({ overview, audience }: WhyItMattersSectionProps) {
  const { t, lang } = useI18n();
  const [role, setRole] = usePreferredRole();
  const heading: Record<Role, string> = {
    pm: t.cluster.audiencePm,
    developer: t.cluster.audienceDeveloper,
    studentJobSeeker: t.cluster.audienceStudent,
  };
  const body = (r: Role) => (
    <BilingualAssistBody
      value={audience[r]}
      lang={lang}
      className="space-y-2 text-sm leading-relaxed [color:var(--text-muted)]"
    />
  );
  const others = ROLES.filter((r) => r !== role);

  return (
    <section className="mb-6">
      <SectionTitle>{t.cluster.whyItMatters}</SectionTitle>
      <div className="text-sm leading-relaxed text-foreground">
        <BilingualAssistBody value={overview} lang={lang} />
      </div>

      <div className="mt-5 border-t pt-4 [border-color:var(--border)]">
        <div role="radiogroup" aria-label={t.home.readAs} className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="[color:var(--text-muted)]">{t.home.readAs}:</span>
          {[null, ...ROLES].map((r) => (
            <button
              key={r ?? "all"}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={[
                "border-b-2 pb-0.5 transition-colors",
                role === r
                  ? "font-semibold text-foreground [border-color:var(--accent)]"
                  : "border-transparent [color:var(--text-muted)] hover:text-foreground",
              ].join(" ")}
            >
              {r ? roleLabel(r, lang) : t.home.allReaders}
            </button>
          ))}
        </div>

        {role ? (
          <>
            <div className="border-l-2 pl-3 [border-color:var(--accent)]">
              <h3 className="font-semibold text-foreground">{t.cluster.forYou(heading[role])}</h3>
              <div className="mt-1 text-[15px] leading-relaxed text-foreground">
                <BilingualAssistBody
                  value={audience[role]}
                  lang={lang}
                  className="space-y-2 text-[15px] leading-relaxed text-foreground"
                />
              </div>
            </div>
            <details className="group mt-4 text-sm">
              <summary className="cursor-pointer list-none [color:var(--text-muted)] hover:text-foreground">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                {t.cluster.otherReaders(others.map((r) => heading[r]).join(lang === "zh" ? "、" : ", "))}
              </summary>
              <div className="mt-3 space-y-4">
                {others.map((r) => (
                  <div key={r}>
                    <h3 className="font-semibold text-foreground">{heading[r]}</h3>
                    <div className="mt-1">{body(r)}</div>
                  </div>
                ))}
              </div>
            </details>
          </>
        ) : (
          <div className="space-y-4 text-sm leading-relaxed text-foreground">
            {ROLES.map((r) => (
              <div key={r}>
                <h3 className="font-semibold text-foreground">{heading[r]}</h3>
                <div className="mt-1">{body(r)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
