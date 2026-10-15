"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { uiButtonSecondary } from "@/lib/ui/classes";

type ErrorStateProps = {
  title?: string;
  message?: string;
  /** e.g. Next.js error boundary reset */
  onRetry?: () => void;
  children?: ReactNode;
};

export function ErrorState({
  title,
  message,
  onRetry,
  children,
}: ErrorStateProps) {
  const { t } = useI18n();

  return (
    <div className="sp-glass mx-auto my-[6vh] max-w-2xl px-6 py-12 text-center" role="alert">
      <h1 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-light leading-tight text-foreground">
        {title ?? t.error.title}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed [color:var(--text-soft)]">
        {message ?? t.error.description}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={`mt-6 ${uiButtonSecondary}`}
        >
          {t.error.tryAgain}
        </button>
      ) : null}
      {children}
    </div>
  );
}
