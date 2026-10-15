"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchAdmin } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

type SourceRow = {
  id: string;
  slug: string | null;
  name: string;
  type: string;
  is_active: boolean;
  fetch_frequency_minutes: number;
  last_polled_at: string | null;
  etag: string | null;
  article_count: number;
  articles_last_7d: number;
};

function fmtAgo(iso: string | null, zh: boolean): string {
  if (!iso) return zh ? "从未" : "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return zh ? "刚刚" : "Just now";
  if (min < 60) return zh ? `${min} 分钟前` : `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return zh ? `${h} 小时前` : `${h}h ago`;
  return zh ? `${Math.floor(h / 24)} 天前` : `${Math.floor(h / 24)}d ago`;
}

const TYPE_LABEL: Record<string, { en: string; zh: string }> = {
  company_news: { en: "Official", zh: "官方" },
  tech_press:   { en: "Tech media", zh: "科技媒体" },
  newsletter:   { en: "Newsletter", zh: "通讯" },
  research:     { en: "Research", zh: "学术" },
};

export function SourcesClient() {
  const { lang } = useI18n();
  const zh = lang === "zh";

  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    apiFetchAdmin<SourceRow[]>("/api/admin/sources")
      .then((rows) => {
        setSources(rows);
        setLoadedAt(Date.now());
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display text-[2rem] font-light leading-tight text-foreground">
          {zh ? "信源监控" : "Source Health"}
        </h1>
        <p className="mt-0.5 text-sm [color:var(--text-muted)]">
          {zh ? "各信源抓取状态及文章量" : "Fetch status and article counts per source"}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl [background:var(--panel-fill-2)]" />)}</div>
      ) : error ? (
        <p className="text-sm [color:var(--red)]">{zh ? "加载失败：" : "Failed: "}{error}</p>
      ) : (
        <div className="sp-glass overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b [border-color:var(--panel-divider)] [background:var(--panel-fill-2)]">
                <th className="py-2.5 pl-4 pr-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "信源" : "Source"}</th>
                <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "类型" : "Type"}</th>
                <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "状态" : "Status"}</th>
                <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "最后抓取" : "Last polled"}</th>
                <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "频率" : "Frequency"}</th>
                <th className="px-2 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "近 7 天" : "7-day"}</th>
                <th className="px-2 py-2.5 pr-4 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">{zh ? "总计" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => {
                const stale = src.last_polled_at
                  ? loadedAt - new Date(src.last_polled_at).getTime() > src.fetch_frequency_minutes * 60 * 1000 * 3
                  : true;
                const typeLabel = TYPE_LABEL[src.type];
                const freq = src.fetch_frequency_minutes >= 1440
                  ? zh ? `每 ${src.fetch_frequency_minutes / 1440} 天` : `every ${src.fetch_frequency_minutes / 1440}d`
                  : zh ? `每 ${src.fetch_frequency_minutes} 分钟` : `every ${src.fetch_frequency_minutes}m`;
                return (
                  <tr key={src.id} className="border-t [border-color:var(--panel-divider)] hover:[background:var(--panel-hover)]">
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{src.name}</span>
                        {src.slug && (
                          <Link href={`/admin/articles?source_id=${src.id}`} className="text-xs [color:var(--text-muted)] hover:underline">
                            {src.slug}
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-xs [color:var(--text-muted)]">
                      {typeLabel ? (zh ? typeLabel.zh : typeLabel.en) : src.type}
                    </td>
                    <td className="px-2 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${src.is_active ? "[background:color-mix(in_srgb,var(--green)_16%,transparent)] [color:var(--green)]" : "[background:var(--panel-fill-2)] [color:var(--text-muted)]"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${src.is_active ? "[background:var(--green)]" : "[background:var(--text-muted)]"}`} />
                        {src.is_active ? (zh ? "活跃" : "Active") : (zh ? "停用" : "Inactive")}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-xs" style={{ color: stale && src.is_active ? "var(--red)" : "var(--text-muted)" }}>
                      {fmtAgo(src.last_polled_at, zh)}
                    </td>
                    <td className="px-2 py-3 text-xs [color:var(--text-muted)]">{freq}</td>
                    <td className="px-2 py-3 text-sm font-medium" style={{ color: "var(--sp-accent-mid)" }}>
                      {src.articles_last_7d}
                    </td>
                    <td className="px-2 py-3 pr-4 text-sm [color:var(--text-soft)] tabular-nums">
                      {src.article_count.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
