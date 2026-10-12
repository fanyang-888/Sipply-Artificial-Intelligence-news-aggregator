"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  {
    href: "/",
    label: "Digest",
    matchExact: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: "/archive",
    label: "Search",
    matchPrefix: "/archive",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}
      aria-label="Main navigation"
    >
      {tabs.map((tab) => {
        const active = tab.matchExact
          ? pathname === tab.href
          : tab.matchPrefix
            ? pathname.startsWith(tab.matchPrefix)
            : false;

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className="flex flex-1 flex-col items-center gap-1 py-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <span style={{ stroke: active ? "var(--accent)" : "var(--text-dim)" }}>{tab.icon}</span>
            <span style={{ fontSize: "9px", letterSpacing: "0.04em", color: active ? "var(--accent)" : "var(--text-muted)" }}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
