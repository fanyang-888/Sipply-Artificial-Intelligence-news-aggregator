"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { apiFetchAdmin } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

type ArticleRow = {
  id: string;
  title: string;
  url: string;
  source_name: string | null;
  published_at: string | null;
  fetched_at: string | null;
  signal_score: number | null;
  is_filtered_out: boolean | null;
  filter_reason: string | null;
  cluster_id: string | null;
  word_count: number | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

function ArticlesInner() {
  const sourceId = useSearchParams().get("source_id");
  return <ArticlesList key={sourceId ?? ""} sourceId={sourceId} />;
}

function ArticlesList({ sourceId }: { sourceId: string | null }) {
  const { lang } = useI18n();
  const zh = lang === "zh";

  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filterMode, setFilterMode] = useState<"all" | "ok" | "filtered">("all");
  const PAGE_SIZE = 50;

  // A different source_id remounts this component (key in ArticlesInner), so loading starts over
  useEffect(() => {
    const qs = new URLSearchParams({ limit: "200", offset: "0" });
    if (sourceId) qs.set("source_id", sourceId);
    apiFetchAdmin<ArticleRow[]>(`/api/admin/articles?${qs}`)
      .then(setArticles)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [sourceId]);

  const filtered =
    filterMode === "ok" ? articles.filter((a) => !a.is_filtered_out) :
    filterMode === "filtered" ? articles.filter((a) => a.is_filtered_out) :
    articles;

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1
            className="font-display text-[2rem] font-light leading-tight text-foreground"
          >
            {zh ? "文章" : "Articles"}
            {sourceId && (
              <span className="ml-2 text-base [color:var(--text-muted)]">
                {zh ? "（已过滤信源）" : "(filtered by source)"}
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm [color:var(--text-muted)]">
            {zh ? `显示最新 ${filtered.length} 篇` : `Showing latest ${filtered.length} articles`}
          </p>
        </div>

        <div className="flex gap-2">
          {(["all", "ok", "filtered"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setFilterMode(m); setPage(0); }}
              className="rounded-md border px-3 py-1.5 text-xs transition-colors"
              style={{
                borderColor: filterMode === m ? "var(--sp-accent-mid)" : "var(--panel-divider)",
                color: filterMode === m ? "var(--sp-accent-mid)" : "var(--text-muted)",
                background: filterMode === m ? "var(--panel-fill-2)" : "transparent",
              }}
            >
              {zh
                ? { all: "全部", ok: "通过过滤", filtered: "已过滤" }[m]
                : { all: "All", ok: "Passed", filtered: "Filtered out" }[m]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl [background:var(--panel-fill-2)]" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm [color:var(--red)]">{zh ? "加载失败：" : "Failed: "}{error}</p>
      ) : (
        <>
          <div className="sp-glass overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b [border-color:var(--panel-divider)] [background:var(--panel-fill-2)]">
                  <th className="py-2.5 pl-4 pr-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "标题" : "Title"}</th>
                  <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "信源" : "Source"}</th>
                  <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "过滤" : "Filter"}</th>
                  <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "评分" : "Score"}</th>
                  <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "字数" : "Words"}</th>
                  <th className="px-2 py-2.5 pr-4 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "抓取时间" : "Fetched"}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((a) => (
                  <tr key={a.id} className="border-t [border-color:var(--panel-divider)] hover:[background:var(--panel-hover)]">
                    <td className="py-2.5 pl-4 pr-2 max-w-xs">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-foreground hover:underline line-clamp-1"
                      >
                        {a.title || a.url}
                      </a>
                    </td>
                    <td className="px-2 py-2.5 text-xs [color:var(--text-muted)] whitespace-nowrap">
                      {a.source_name ?? "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      {a.is_filtered_out === null ? (
                        <span className="text-xs [color:var(--text-muted)]">{zh ? "待处理" : "Pending"}</span>
                      ) : a.is_filtered_out ? (
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs [background:color-mix(in_srgb,var(--red)_16%,transparent)] [color:var(--red)]">
                          {a.filter_reason ?? (zh ? "过滤" : "filtered")}
                        </span>
                      ) : (
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs [background:color-mix(in_srgb,var(--green)_16%,transparent)] [color:var(--green)]">
                          {zh ? "通过" : "OK"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-sm tabular-nums [color:var(--text-soft)]">
                      {a.signal_score != null ? Math.round(a.signal_score) : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-xs [color:var(--text-muted)] tabular-nums">
                      {a.word_count != null ? a.word_count.toLocaleString() : "—"}
                    </td>
                    <td className="px-2 py-2.5 pr-4 text-xs [color:var(--text-muted)] whitespace-nowrap">
                      {fmtDate(a.fetched_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2 text-sm [color:var(--text-muted)]">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-full px-3 py-1 text-foreground ring-1 ring-inset [--tw-ring-color:var(--panel-divider)] hover:[--tw-ring-color:var(--accent)] disabled:opacity-40"
              >
                {zh ? "← 上一页" : "← Prev"}
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-full px-3 py-1 text-foreground ring-1 ring-inset [--tw-ring-color:var(--panel-divider)] hover:[--tw-ring-color:var(--accent)] disabled:opacity-40"
              >
                {zh ? "下一页 →" : "Next →"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ArticlesClient() {
  return (
    <Suspense fallback={
      <div className="px-8 py-8">
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl [background:var(--panel-fill-2)]" />
          ))}
        </div>
      </div>
    }>
      <ArticlesInner />
    </Suspense>
  );
}
