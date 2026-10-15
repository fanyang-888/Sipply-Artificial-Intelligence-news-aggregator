import Link from "next/link";
import type { ReactNode } from "react";
import { uiMicroLabel, uiPageDescription, uiPageTitle } from "@/lib/ui/classes";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Mono label line above the title (date, week, category). */
  eyebrow?: ReactNode;
  /** "← All topics" above everything else. */
  back?: { href: string; label: string };
  /** Meta lines or links under the description. */
  children?: ReactNode;
};

/**
 * Every page's opening, in the home page's language: one light falls on a
 * Fraunces title; labels are small mono capitals; the description is the
 * only paragraph.
 */
export function PageHeader({ title, description, eyebrow, back, children }: PageHeaderProps) {
  return (
    <header className="relative overflow-x-clip pb-10 pt-4 sm:pb-14 sm:pt-8">
      <div className="sp-beam" aria-hidden />
      <div className="relative z-[1]">
        {back ? (
          <Link href={back.href} className={`${uiMicroLabel} mb-6 inline-block no-underline hover:text-foreground`}>
            <span aria-hidden>← </span>
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className={`${uiMicroLabel} mb-5 flex flex-wrap items-center gap-x-3 gap-y-1`}>{eyebrow}</p> : null}
        <h1 className={uiPageTitle}>{title}</h1>
        {description ? <p className={uiPageDescription}>{description}</p> : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </header>
  );
}
