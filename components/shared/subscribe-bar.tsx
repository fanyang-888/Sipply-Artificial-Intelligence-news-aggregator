"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { postSubscribe } from "@/lib/api";

type State = "idle" | "loading" | "success" | "already" | "error";

export function SubscribeBar() {
  const { t } = useI18n();
  const s = t.subscribe;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || state === "loading") return;
    setState("loading");
    try {
      const res = await postSubscribe(email.trim());
      setState(res.status === "already_subscribed" ? "already" : "success");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="sp-glass px-6 py-8 text-center sm:px-8">
      {state === "success" || state === "already" ? (
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">
            {state === "success" ? s.successHeading : s.alreadySubscribed}
          </p>
          {state === "success" && (
            <p className="text-sm [color:var(--text-muted)]">{s.successMessage}</p>
          )}
        </div>
      ) : (
        <>
          <h2
            className="text-[22px] leading-tight text-foreground"
            style={{ fontFamily: "'Fraunces', 'Playfair Display', serif", fontWeight: 400 }}
          >
            {s.heading}
          </h2>
          <p className="mt-2 text-sm [color:var(--text-soft)]">{s.subheading}</p>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={s.placeholder}
              disabled={state === "loading"}
              className="w-full rounded-full border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:opacity-50 sm:w-64 [border-color:var(--border)] [background:var(--panel-fill-2)] [color:var(--text)] placeholder:[color:var(--text-muted)] focus:ring-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="rounded-full px-5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 hover:opacity-90 [background:var(--cta-bg)] [color:var(--cta-text)] focus:ring-[var(--accent)]"
            >
              {state === "loading" ? "…" : s.cta}
            </button>
          </form>

          {state === "error" && (
            <p className="mt-3 text-xs text-red-500">{s.errorMessage}</p>
          )}
        </>
      )}
    </section>
  );
}
