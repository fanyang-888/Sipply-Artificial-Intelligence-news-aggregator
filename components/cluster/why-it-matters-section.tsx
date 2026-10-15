"use client";

import { RoleSwitch } from "@/components/home/role-switch";
import { BilingualAssistBody } from "@/components/shared/bilingual-assist-text";
import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import { ROLES, usePreferredRole, type Role } from "@/lib/preferred-role";
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
  const [role] = usePreferredRole();
  const heading: Record<Role, string> = {
    pm: t.cluster.audiencePm,
    developer: t.cluster.audienceDeveloper,
    studentJobSeeker: t.cluster.audienceStudent,
  };
  const body = (r: Role) => (
    <BilingualAssistBody
      value={audience[r]}
      lang={lang}
      className="space-y-2 text-[15px] leading-relaxed [color:var(--text-soft)]"
    />
  );
  const others = ROLES.filter((r) => r !== role);

  return (
    <section aria-labelledby="story-why">
      <SectionTitle id="story-why">{t.cluster.whyItMatters}</SectionTitle>
      <BilingualAssistBody
        value={overview}
        lang={lang}
        className="space-y-3 text-[15.5px] leading-relaxed text-foreground"
      />

      <div className="sp-glass mt-7 p-6 sm:p-7">
        <RoleSwitch />

        {role ? (
          <>
            <div className="mt-5 border-l-2 pl-4 [border-color:var(--accent)]">
              <h3 className="font-display text-[1.15rem] leading-tight text-foreground">{t.cluster.forYou(heading[role])}</h3>
              <BilingualAssistBody
                value={audience[role]}
                lang={lang}
                className="mt-2 space-y-2 text-[15.5px] leading-relaxed text-foreground"
              />
            </div>
            <details className="group mt-5 text-sm">
              <summary className="cursor-pointer list-none [color:var(--text-muted)] hover:text-foreground">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                {t.cluster.otherReaders(others.map((r) => heading[r]).join(lang === "zh" ? "、" : ", "))}
              </summary>
              <div className="sp-rows mt-3">
                {others.map((r) => (
                  <div key={r} className="py-4">
                    <h3 className="font-display text-[1.05rem] leading-tight text-foreground">{heading[r]}</h3>
                    <div className="mt-1.5">{body(r)}</div>
                  </div>
                ))}
              </div>
            </details>
          </>
        ) : (
          <div className="sp-rows mt-3">
            {ROLES.map((r) => (
              <div key={r} className="py-4">
                <h3 className="font-display text-[1.05rem] leading-tight text-foreground">{heading[r]}</h3>
                <div className="mt-1.5">{body(r)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
