"use client";

import { Suspense, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { TopNavSearch } from "@/components/layout/top-nav-search";
import { LanguageToggle } from "@/components/layout/language-toggle";

// The theme lives on <html data-theme> (set before paint by app/layout.tsx); this reads it there
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = (): "dark" | "light" =>
  document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as const);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("sipply-theme", next); } catch {}
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle light/dark mode"
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-muted)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        flexShrink: 0,
        transition: "border-color .2s, color .2s",
      }}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

export function TopNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const onArchive = pathname === "/archive";
  const onRadar = pathname === "/radar";
  const onTopics = pathname.startsWith("/topics");
  const onWeekly = pathname.startsWith("/weekly");
  const onDigest = pathname === "/";

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "var(--masthead-bg)",
        borderBottom: "1px solid var(--border)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "var(--shadow)",
      }}
    >
      <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-6 sm:px-10 py-0 h-14">

        {/* Brand */}
        <Link
          href="/"
          className="shrink-0 flex items-center gap-2 tracking-tight"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 900,
            fontSize: 22,
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <Image src="/logo.png" alt="Sipply" width={26} height={26} className="shrink-0" />
          Sip<span style={{ color: "var(--accent)" }}>ply</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-7" aria-label={t.nav.mainAria}>
          {[
            { href: "/", label: t.nav.dailyDigest, active: onDigest },
            { href: "/archive", label: t.nav.archive, active: onArchive },
            { href: "/radar", label: t.nav.radar, active: onRadar },
            { href: "/topics", label: t.nav.topics, active: onTopics },
            { href: "/weekly", label: t.nav.weekly, active: onWeekly },
          ].map(({ href, label, active }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: active ? "var(--accent)" : "var(--text-muted)",
                textDecoration: "none",
                transition: "color .2s",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Spacer + controls */}
        <div className="flex flex-1 items-center justify-end gap-3">
          {/* Search — desktop */}
          <div className="hidden sm:block w-44 sm:w-52">
            <Suspense
              fallback={
                <div
                  className="h-8 w-full rounded-md"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  aria-hidden
                />
              }
            >
              <TopNavSearch />
            </Suspense>
          </div>
          {/* Search icon — mobile */}
          <Link
            href="/archive"
            className="sm:hidden flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            aria-label="Search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </Link>
          {/* Trend Radar — mobile (the desktop nav links are hidden below sm) */}
          <Link
            href="/radar"
            className="sm:hidden flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: onRadar ? "var(--accent)" : "var(--surface)",
              border: "1px solid var(--border)",
            }}
            aria-label={t.nav.radar}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke={onRadar ? "var(--bg)" : "var(--accent)"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
              <path d="M19.07 4.93A10 10 0 1 0 22 12" /><path d="M16.24 7.76A6 6 0 1 0 18 12" /><circle cx="12" cy="12" r="1.5" /><line x1="12" y1="12" x2="19" y2="5" />
            </svg>
          </Link>
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
