"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { uiButtonSecondary } from "@/lib/ui/classes";

const NAV = [
  { href: "/admin",               en: "Dashboard",  zh: "仪表盘",  icon: "◈" },
  { href: "/admin/pipeline-runs", en: "Pipeline",   zh: "Pipeline", icon: "⟳" },
  { href: "/admin/sources",       en: "Sources",    zh: "信源",     icon: "⊞" },
  { href: "/admin/clusters",      en: "Clusters",   zh: "Clusters", icon: "◉" },
  { href: "/admin/articles",      en: "Articles",   zh: "文章",     icon: "≡" },
  { href: "/admin/events",        en: "Events",     zh: "事件统计", icon: "◷" },
  { href: "/admin/gaps",          en: "Content gaps", zh: "内容缺口", icon: "◌" },
  { href: "/admin/ai-citations",  en: "AI citations", zh: "AI 引用",  icon: "❝" },
];

/** The admin shell in the site's language: a quiet sidebar panel, mono nav labels, the theme's colours. */
export default function AdminShellLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang } = useI18n();

  async function handleLogout() {
    await fetch("/api/admin-auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div className="-mx-6 -my-8 flex min-h-screen sm:-mx-10">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r [background:var(--panel-fill)] [border-color:var(--panel-divider)]">
        {/* Brand */}
        <div className="flex h-14 items-baseline gap-2 border-b px-5 [border-color:var(--panel-divider)]">
          <span className="font-display text-[20px] font-light text-foreground">
            Sip<span className="[color:var(--accent)]">ply</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] [color:var(--text-muted)]">Admin</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3">
          {NAV.map(({ href, en, zh, icon }) => {
            const active = href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-2.5 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] no-underline transition-colors",
                  active ? "text-foreground [background:var(--panel-fill-2)]" : "[color:var(--text-muted)] hover:text-foreground",
                ].join(" ")}
              >
                <span className={`text-[12px] ${active ? "[color:var(--accent)]" : "opacity-60"}`}>{icon}</span>
                {lang === "zh" ? zh : en}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="border-t p-4 [border-color:var(--panel-divider)]">
          <button type="button" onClick={handleLogout} className={`${uiButtonSecondary} w-full justify-center`}>
            {lang === "zh" ? "退出登录" : "Log out"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
