"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { TopNavSearch } from "@/components/layout/top-nav-search";
import { LanguageToggle } from "@/components/layout/language-toggle";

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = document.documentElement.getAttribute("data-theme") as "dark" | "light";
    setTheme(saved || "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    try { localStorage.setItem("sipply-theme", next); } catch (e) {}
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
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
