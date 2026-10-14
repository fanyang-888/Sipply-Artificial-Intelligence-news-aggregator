"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

type LocalizedStr = { en: string; zh?: string | null };

type ClusterRow = {
  id: string;
  title: LocalizedStr;
  theme: string;
  tags: string[];
  storyStatus: string;
  clusterScore: number | null;
  freshnessLabel: string;
  lastSeenAt: string | null;
  articleCount: number;
  sourceCount: number;
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  new:        { bg: "#dbeafe", text: "#1d4ed8" },
  ongoing:    { bg: "#dcfce7", text: "#15803d" },
  escalating: { bg: "#fef9c3", text: "#92400e" },
  peaking:    { bg: "#fee2e2", text: "#b91c1c" },
  fading:     { bg: "#f3f4f6", text: "#6b7280" },
};

const STATUS_LABELS: Record<string, { en: string; zh: string }> = {
  new:        { en: "New",        zh: "新" },
  ongoing:    { en: "Ongoing",    zh: "持续" },
  escalating: { en: "Escalating", zh: "升温" },
  peaking:    { en: "Peaking",    zh: "高峰" },
  fading:     { en: "Fading",     zh: "消退" },
};

export function ClustersClient() {
  const { lang } = useI18n();
  const zh = lang === "zh";

  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const PAGE_SIZE = 20;

  useEffect(() => {
    apiFetch<ClusterRow[]>(`/api/clusters?limit=100&offset=0`)
      .then(setClusters)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterStatus ? clusters.filter((c) => c.storyStatus === filterStatus) : clusters;
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="px-8 py-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-light" style={{ fontFamily: "'Fraunces', serif", color: "var(--sp-navy)" }}>
            Clusters
          </h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            {zh
              ? `共 ${filtered.length} 个${filterStatus ? "（已筛选）" : ""}`
              : `${filtered.length} clusters${filterStatus ? " (filtered)" : ""}`}
          </p>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 focus:outline-none"
        >
          <option value="">{zh ? "全部状态" : "All statuses"}</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{zh ? label.zh : label.en}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-md bg-zinc-100" />)}</div>
      ) : error ? (
        <p className="text-sm text-red-600">{zh ? "加载失败：" : "Failed: "}{error}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="py-2.5 pl-4 pr-2 text-xs font-medium text-zinc-500">{zh ? "标题" : "Title"}</th>
                  <th className="px-2 py-2.5 text-xs font-medium text-zinc-500">{zh ? "状态" : "Status"}</th>
                  <th className="px-2 py-2.5 text-xs font-medium text-zinc-500">{zh ? "分数" : "Score"}</th>
                  <th className="px-2 py-2.5 text-xs font-medium text-zinc-500">{zh ? "文章" : "Articles"}</th>
                  <th className="px-2 py-2.5 text-xs font-medium text-zinc-500">{zh ? "更新" : "Updated"}</th>
                  <th className="px-2 py-2.5 pr-4 text-xs font-medium text-zinc-500">{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => {
                  const st = STATUS_STYLE[c.storyStatus] ?? STATUS_STYLE.fading;
                  const stLabel = STATUS_LABELS[c.storyStatus];
                  return (
                    <tr key={c.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="py-3 pl-4 pr-2 max-w-xs">
                        <div>
                          <p className="text-sm font-medium text-zinc-800 line-clamp-1">
                            {zh ? (c.title.zh ?? c.title.en) : c.title.en}
                          </p>
                          {zh && c.title.zh && (
                            <p className="text-xs text-zinc-400 line-clamp-1">{c.title.en}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: st.bg, color: st.text }}>
                          {stLabel ? (zh ? stLabel.zh : stLabel.en) : c.storyStatus}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-sm tabular-nums text-zinc-600">
                        {c.clusterScore != null ? Math.round(c.clusterScore) : "—"}
                      </td>
                      <td className="px-2 py-3 text-sm text-zinc-600">{c.articleCount}</td>
                      <td className="px-2 py-3 text-xs text-zinc-400">{c.freshnessLabel}</td>
                      <td className="px-2 py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Link href={`/cluster/${c.id}`} target="_blank" className="text-xs" style={{ color: "var(--sp-accent-mid)" }}>
                            {zh ? "查看" : "View"}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="rounded border px-3 py-1 disabled:opacity-40">
                {zh ? "← 上一页" : "← Prev"}
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded border px-3 py-1 disabled:opacity-40">
                {zh ? "下一页 →" : "Next →"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
