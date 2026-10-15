"use client";

import { useI18n } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

const btnBase =
  "rounded-full px-2 py-0.5 font-mono text-[11px] tracking-[0.06em] transition-colors";
const inactive = "[color:var(--text-muted)] hover:text-foreground";
const active = "[background:var(--panel-fill-2)] text-foreground";

export function LanguageToggle() {
  const { lang, setLang } = useI18n();

  function select(next: Lang) {
    setLang(next);
  }

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 [color:var(--text-muted)]"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => select("en")}
        className={`${btnBase} ${lang === "en" ? active : inactive}`}
        aria-pressed={lang === "en"}
      >
        EN
      </button>
      <span className="text-xs [color:var(--panel-edge-a)]" aria-hidden>
        |
      </span>
      <button
        type="button"
        onClick={() => select("zh")}
        className={`${btnBase} ${lang === "zh" ? active : inactive}`}
        aria-pressed={lang === "zh"}
      >
        中文
      </button>
    </div>
  );
}
