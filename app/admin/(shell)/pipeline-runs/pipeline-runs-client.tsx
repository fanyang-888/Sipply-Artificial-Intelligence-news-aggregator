"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";

type StageResult = { status: "ok" | "failed" | "skipped"; elapsed_sec: number };

type PipelineRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  stage_results: Record<string, StageResult> | null;
  total_elapsed_sec: number | null;
  triggered_by: string | null;
};

const STAGE_ORDER = [
  "ingest_full_articles","filter_articles","score_articles","cluster_articles",
  "update_cluster_status","dedup_clusters","summarize","translate_clusters",
  "ingest_signals","build_signal_topics","translate_signals","send_digest_email",
];

const STAGE_LABEL: Record<string, string> = {
  ingest_full_articles: "Ingest", filter_articles: "Filter", score_articles: "Score",
  cluster_articles: "Cluster", update_cluster_status: "Status", dedup_clusters: "Dedup",
  summarize: "Summarize", translate_clusters: "Translate clusters",
  ingest_signals: "Radar signals", build_signal_topics: "Radar topics",
  translate_signals: "Radar 中文",
  send_digest_email: "Email",
};

const STAGE_CHIP: Record<StageResult["status"], { cls: string; icon: string }> = {
  ok: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: "✓" },
  failed: { cls: "border-red-200 bg-red-50 text-red-700", icon: "✗" },
  skipped: { cls: "border-zinc-200 bg-zinc-100 text-zinc-500", icon: "–" },
};

function fmt(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

function StatusDot({ status }: { status: PipelineRun["status"] }) {
  const bg = status === "success" ? "#16a34a" : status === "failed" ? "#dc2626" : "#d97706";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${status === "running" ? "animate-pulse" : ""}`}
      style={{ background: bg }}
    />
  );
}

function RunRow({ run, lang }: { run: PipelineRun; lang: "en" | "zh" }) {
  const [open, setOpen] = useState(false);
  const stages = run.stage_results ?? {};
  const statusLabel = {
    success: lang === "zh" ? "成功" : "Success",
    failed:  lang === "zh" ? "失败" : "Failed",
    running: lang === "zh" ? "运行中" : "Running",
  }[run.status];

  return (
    <>
      <tr className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50" onClick={() => setOpen(v => !v)}>
        <td className="py-2.5 pl-4 pr-2">
          <span className="flex items-center gap-2">
            <StatusDot status={run.status} />
            <span className="text-xs font-medium text-zinc-700">{statusLabel}</span>
          </span>
        </td>
        <td className="px-2 py-2.5 text-xs text-zinc-600">{fmtDate(run.started_at)}</td>
        <td className="px-2 py-2.5 text-xs text-zinc-600">
          {run.total_elapsed_sec != null ? fmt(run.total_elapsed_sec) : run.finished_at ? "—" : (lang === "zh" ? "运行中…" : "running…")}
        </td>
        <td className="px-2 py-2.5 text-xs text-zinc-500">{run.triggered_by ?? "—"}</td>
        <td className="py-2.5 pl-2 pr-4 text-xs text-zinc-400">{open ? "▲" : "▼"}</td>
      </tr>
      {open && (
        <tr className="border-t border-zinc-100 bg-zinc-50/60">
          <td colSpan={5} className="px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {STAGE_ORDER.map((key) => {
                const s = stages[key];
                if (!s) return null;
                const chip = STAGE_CHIP[s.status] ?? STAGE_CHIP.failed;
                return (
                  <span key={key} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${chip.cls}`}>
                    {chip.icon} {STAGE_LABEL[key] ?? key}
                    {s.status === "skipped" ? null : (
                      <span className="font-mono text-[10px] opacity-70">{fmt(s.elapsed_sec)}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function PipelineRunsClient() {
  const { lang } = useI18n();
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<PipelineRun[]>("/api/pipeline-runs?limit=30");
      setRuns(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const zh = lang === "zh";

  return (
    <div className="px-8 py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-light" style={{ fontFamily: "'Fraunces', serif", color: "var(--sp-navy)" }}>
          Pipeline Runs
        </h1>
        <p className="mt-0.5 text-sm text-zinc-400">
          {zh ? "最近 30 次 · 每 30 秒自动刷新" : "Last 30 runs · auto-refreshes every 30s"}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-zinc-100" />)}</div>
      ) : error ? (
        <p className="text-sm text-red-600">Error: {error}</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-zinc-500">{zh ? "暂无运行记录。" : "No pipeline runs yet."}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="py-2 pl-4 pr-2 text-xs font-medium text-zinc-500">{zh ? "状态" : "Status"}</th>
                <th className="px-2 py-2 text-xs font-medium text-zinc-500">{zh ? "开始时间（北京）" : "Started (CST)"}</th>
                <th className="px-2 py-2 text-xs font-medium text-zinc-500">{zh ? "耗时" : "Duration"}</th>
                <th className="px-2 py-2 text-xs font-medium text-zinc-500">{zh ? "触发方式" : "Trigger"}</th>
                <th className="py-2 pl-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => <RunRow key={run.id} run={run} lang={lang} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
