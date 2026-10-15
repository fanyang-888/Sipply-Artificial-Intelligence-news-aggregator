"use client";

import { uiButtonPrimary, uiInput } from "@/lib/ui/classes";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function AdminLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const from = searchParams.get("from") ?? "/admin/pipeline-runs";
        router.push(from);
        router.refresh();
      } else {
        setError("密码错误");
        setPassword("");
      }
    } catch {
      setError("请求失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs space-y-4"
      >
        <div>
          <h1 className="font-display text-[2rem] font-light leading-tight text-foreground">Admin</h1>
          <p className="mt-1 text-sm [color:var(--text-muted)]">Enter the admin password to continue.</p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          className={`${uiInput} w-full`}
        />

        {error && (
          <p className="text-sm [color:var(--red)]">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className={`${uiButtonPrimary} w-full justify-center disabled:opacity-40`}
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
