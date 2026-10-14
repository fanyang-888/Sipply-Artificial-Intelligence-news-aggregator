"use client";

import { useI18n } from "@/lib/i18n";
import { ROLES, roleLabel, usePreferredRole, type Role } from "@/lib/preferred-role";

/**
 * Always-visible "read as" switch above the digest. Picking a role re-ranks
 * today's stories and swaps each card's "why it matters" to that angle;
 * "All readers" clears it. (Replaces the one-time "Who are you?" banner,
 * which collapsed into a small "Change" link that few readers noticed.)
 */
export function RoleTabs() {
  const { t, lang } = useI18n();
  const [role, setRole] = usePreferredRole();
  const options: (Role | null)[] = [null, ...ROLES];

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] [color:var(--text-muted)]">
          {t.home.readAs}
        </span>
        <div
          role="radiogroup"
          aria-label={t.home.readAs}
          className="inline-flex flex-wrap gap-1 rounded-xl border p-1 [background:var(--surface)] [border-color:var(--border)]"
        >
          {options.map((r) => {
            const on = role === r;
            return (
              <button
                key={r ?? "all"}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRole(r)}
                className={[
                  "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                  on
                    ? "font-semibold [background:var(--accent)] [color:var(--bg)]"
                    : "[color:var(--text-muted)] hover:text-foreground",
                ].join(" ")}
              >
                {r ? (
                  <>
                    <span className="sm:hidden">{roleLabel(r, lang, true)}</span>
                    <span className="hidden sm:inline">{roleLabel(r, lang)}</span>
                  </>
                ) : (
                  t.home.allReaders
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs [color:var(--text-muted)]">
        {role ? t.home.readAsHint(roleLabel(role, lang)) : t.home.readAsPrompt}
      </p>
    </div>
  );
}
