"use client";

import { useI18n } from "@/lib/i18n";
import { ROLES, roleLabel, usePreferredRole } from "@/lib/preferred-role";

/** "Read as: All · PM · Dev · Student": re-ranks today's stories and switches each "why it matters". */
export function RoleSwitch({ className = "" }: { className?: string }) {
  const { t, lang } = useI18n();
  const [role, setRole] = usePreferredRole();
  return (
    <div role="radiogroup" aria-label={t.home.readAs} className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] ${className}`.trim()}>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] [color:var(--text-muted)]">{t.home.readAs}</span>
      {[null, ...ROLES].map((r) => (
        <button
          key={r ?? "all"}
          type="button"
          role="radio"
          aria-checked={role === r}
          onClick={() => setRole(r)}
          className={[
            "border-b pb-0.5 transition-colors",
            role === r
              ? "text-foreground [border-color:var(--accent)]"
              : "border-transparent [color:var(--text-muted)] hover:text-foreground",
          ].join(" ")}
        >
          {r ? roleLabel(r, lang, true) : t.home.allReaders}
        </button>
      ))}
    </div>
  );
}
