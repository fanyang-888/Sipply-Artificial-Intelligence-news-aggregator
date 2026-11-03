"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/shared/link";
import { SubscriptionPanel } from "@/components/subscription/subscription-panel";
import { postUnsubscribe } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { uiButtonPrimary } from "@/lib/ui/classes";

type State = "idle" | "working" | "done" | "error";

/**
 * Opened from the link in a digest's footer. Leaving takes a click, not just opening the
 * page: mail scanners open links, and must not unsubscribe anyone.
 */
export function UnsubscribeForm() {
  const { t } = useI18n();
  const s = t.subscription;
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>("idle");

  if (!token) return <SubscriptionPanel title={s.unsubscribeTitle} message={s.missingToken} />;
  if (state === "done") {
    return (
      <SubscriptionPanel title={s.unsubscribed} message={s.unsubscribedMessage}>
        <Link href="/" className={uiButtonPrimary}>
          {t.notFound.backToDigest} <span aria-hidden>→</span>
        </Link>
      </SubscriptionPanel>
    );
  }

  async function unsubscribe() {
    setState("working");
    try {
      await postUnsubscribe(token);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <SubscriptionPanel title={s.unsubscribeTitle} message={state === "error" ? s.errorMessage : s.unsubscribeMessage}>
      <button type="button" className={uiButtonPrimary} disabled={state === "working"} onClick={() => void unsubscribe()}>
        {state === "working" ? s.unsubscribing : s.unsubscribeCta}
      </button>
    </SubscriptionPanel>
  );
}
