"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { SITE_TAGLINE } from "@/lib/seo/site";
import { uiMicroLabel } from "@/lib/ui/classes";

/**
 * The site's foot on every public page: the wordmark, one line on what Sipply
 * is, links to every section (so each is one hop from any page, for readers
 * and crawlers alike), and the machine-readable entry points.
 */
export function SiteFooter() {
  const { t } = useI18n();
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  const sections = [
    { href: "/", label: t.nav.dailyDigest },
    { href: "/archive", label: t.nav.archive },
    { href: "/radar", label: t.nav.radar },
    { href: "/topics", label: t.nav.topics },
    { href: "/weekly", label: t.nav.weekly },
  ];
  const link = `${uiMicroLabel} no-underline transition-colors hover:text-foreground`;

  return (
    <footer className="mx-auto w-full max-w-[1280px] border-t px-6 pb-10 pt-8 [border-color:var(--panel-divider)] sm:px-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-display text-[20px] font-light text-foreground">
            Sip<span className="[color:var(--accent)]">ply</span>
          </p>
          <p className="mt-1 font-display text-[17px] font-light text-foreground">{SITE_TAGLINE}</p>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed [color:var(--text-muted)]">{t.footer.tagline}</p>
        </div>
        <nav aria-label={t.footer.sectionsAria} className="flex flex-wrap gap-x-5 gap-y-2 sm:justify-end">
          {sections.map((s) => (
            <Link key={s.href} href={s.href} className={link}>
              {s.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mt-7 font-mono text-[11px] tracking-[0.06em] [color:var(--text-dim)]">
        {t.footer.machine}:{" "}
        <a href="/llms.txt" className="no-underline hover:[color:var(--text-muted)]">llms.txt</a>
        {" · "}
        <a href="/sitemap.xml" className="no-underline hover:[color:var(--text-muted)]">sitemap</a>
        {" · "}
        <a href="/robots.txt" className="no-underline hover:[color:var(--text-muted)]">robots</a>
      </p>
    </footer>
  );
}
