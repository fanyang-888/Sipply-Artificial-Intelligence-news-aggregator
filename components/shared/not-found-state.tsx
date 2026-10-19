"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import Link from "@/components/shared/link";
import { uiButtonPrimary } from "@/lib/ui/classes";

type NotFoundStateProps = {
  title?: string;
  message?: string;
  children?: ReactNode;
};

export function NotFoundState({
  title,
  message,
  children,
}: NotFoundStateProps) {
  const { t } = useI18n();

  return (
    <div className="sp-glass mx-auto my-[8vh] max-w-2xl px-6 py-14 text-center">
      <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-light leading-tight text-foreground">
        {title ?? "Not found"}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed [color:var(--text-soft)]">
        {message ?? "We could not find that page or item."}
      </p>
      {children ? <div className="mt-5">{children}</div> : null}
      <div className="mt-8 flex justify-center">
        <Link href="/" className={uiButtonPrimary}>
          {t.notFound.backToDigest} <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
