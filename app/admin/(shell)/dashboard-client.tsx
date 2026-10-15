"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchAdmin } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

type PipelineRunSummary = {
  id: string;
  status: string;
  started_at: string;
  total_elapsed_sec: number | null;
};

type Stats = {
  total_articles: number;
  articles_last_24h: number;
  total_clusters: number;
  clusters_last_7d: number;
  total_sources: number;
  active_sources: number;
  last_pipeline_run: PipelineRunSummary | null;
};

const L = {
  en: {
    title: "Dashboard",
    totalArticles: "Total Articles",
    todayNew: "New today",
    totalClusters: "Total Clusters",
    last7d: "Last 7 days",
    sources: "Sources",
    totalSources: "total",
    lastPipeline: "Last Pipeline Run",
    viewAll: "View all →",
    running: "Running",
    success: "Success",
    failed: "Failed",
    elapsed: "took",
    noRuns: "No runs recorded yet",
    quickLinks: "Quick access",
    links: [
      { href: "/admin/sources",       label: "Source health" },
      { href: "/admin/clusters",      label: "Cluster quality" },
      { href: "/admin/articles",      label: "Browse articles" },
      { href: "/admin/pipeline-runs", label: "Pipeline history" },
    ],
    loadFailed: "Failed to load:",
    beijingTime: "Beijing time",
  },
  zh: {
    title: "仪表盘",
    totalArticles: "总文章数",
    todayNew: "今日新增",
    totalClusters: "总 Clusters",
    last7d: "近 7 天",
    sources: "信源",
    totalSources: "共",
    lastPipeline: "最近一次 Pipeline",
    viewAll: "查看全部 →",
    running: "运行中",
    success: "成功",
    failed: "失败",
    elapsed: "耗时",
    noRuns: "暂无运行记录",
    quickLinks: "快捷操作",
    links: [
      { href: "/admin/sources",       label: "信源健康状态" },
      { href: "/admin/clusters",      label: "Cluster 质量检查" },
      { href: "/admin/articles",      label: "浏览文章" },
      { href: "/admin/pipeline-runs", label: "Pipeline 历史" },
    ],
    loadFailed: "加载失败：",
    beijingTime: "北京时间",
  },
} as const;

function fmt(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

type CardProps = {
  title: string;
  value: string | number;
  sub?: string;
  href?: string;
  accent?: boolean;
};

function StatCard({ title, value, sub, href, accent }: CardProps) {
  const inner = (
    <div
      className="sp-glass p-5 transition-opacity hover:opacity-90"
    >
      <p className="text-xs [color:var(--text-muted)]">{title}</p>
      <p
        className="mt-1.5 text-3xl font-light tabular-nums"
        style={{ color: accent ? "var(--accent)" : "var(--text)" }}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs [color:var(--text-muted)]">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <>{inner}</>;
}

export function DashboardClient() {
  const { lang } = useI18n();
  const t = L[lang];

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetchAdmin<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const run = stats?.last_pipeline_run;
  const runStatusColor =
    run?.status === "success" ? "var(--green)" :
    run?.status === "failed"  ? "var(--red)" : "var(--amber)";
  const runStatusLabel =
    run?.status === "success" ? t.success :
    run?.status === "failed"  ? t.failed  : t.running;

  return (
    <div className="px-8 py-8 max-w-4xl">
      <h1
        className="mb-6 font-display text-[2rem] font-light leading-tight text-foreground"
      >
        {t.title}
      </h1>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl [background:var(--panel-fill-2)]" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm [color:var(--red)]">{t.loadFailed}{error}</p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard
              title={t.totalArticles}
              value={stats.total_articles.toLocaleString()}
              sub={`${t.todayNew} ${stats.articles_last_24h}`}
              href="/admin/articles"
            />
            <StatCard
              title={t.totalClusters}
              value={stats.total_clusters.toLocaleString()}
              sub={`${t.last7d} ${stats.clusters_last_7d}`}
              href="/admin/clusters"
            />
            <StatCard
              title={t.sources}
              value={stats.active_sources}
              sub={`${t.totalSources} ${stats.total_sources}`}
              href="/admin/sources"
            />
          </div>

          {/* Pipeline status */}
          <div
            className="sp-glass mt-6 p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t.lastPipeline}</p>
              <Link href="/admin/pipeline-runs" className="text-xs" style={{ color: "var(--sp-accent-mid)" }}>
                {t.viewAll}
              </Link>
            </div>
            {run ? (
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ color: runStatusColor, background: `${runStatusColor}18` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: runStatusColor }} />
                  {runStatusLabel}
                </span>
                <span className="text-sm [color:var(--text-soft)]">
                  {fmtDate(run.started_at)}（{t.beijingTime}）
                </span>
                {run.total_elapsed_sec != null && (
                  <span className="text-sm [color:var(--text-muted)]">
                    {t.elapsed} {fmt(run.total_elapsed_sec)}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm [color:var(--text-muted)]">{t.noRuns}</p>
            )}
          </div>

          {/* Quick links */}
          <div className="mt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider [color:var(--text-muted)]">
              {t.quickLinks}
            </p>
            <div className="flex flex-wrap gap-2">
              {t.links.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="sp-chip"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
