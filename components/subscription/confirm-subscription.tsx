"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/shared/link";
import { SubscriptionPanel } from "@/components/subscription/subscription-panel";
import { postConfirmSubscription } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { uiButtonPrimary, uiButtonSecondary } from "@/lib/ui/classes";

type State = "confirming" | "confirmed" | "already" | "invalid" | "missing" | "error";

async function confirmLink(token: string): Promise<State> {
  try {
    const res = await postConfirmSubscription(token);
    return res.status === "already_confirmed" ? "already" : "confirmed";
  } catch (err) {
    return err instanceof ApiError && err.status === 404 ? "invalid" : "error";
  }
}

/** Opened from the confirmation email: confirms the address the link's token names. */
export function ConfirmSubscription() {
  const { t } = useI18n();
  const s = t.subscription;
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>(token ? "confirming" : "missing");
  const started = useRef(false);

  useEffect(() => {
    // Once, also when React runs effects twice in development
    if (!token || started.current) return;
    started.current = true;
    void confirmLink(token).then(setState);
  }, [token]);

  const home = (
    <Link href="/" className={uiButtonPrimary}>
      {t.notFound.backToDigest} <span aria-hidden>→</span>
    </Link>
  );
  switch (state) {
    case "confirming":
      return <SubscriptionPanel title={s.confirmTitle} message={s.confirming} />;
    case "confirmed":
      return <SubscriptionPanel title={s.confirmed} message={s.confirmedMessage}>{home}</SubscriptionPanel>;
    case "already":
      return <SubscriptionPanel title={s.alreadyConfirmed} message={s.confirmedMessage}>{home}</SubscriptionPanel>;
    case "invalid":
      return <SubscriptionPanel title={s.invalidTitle} message={s.invalidMessage}>{home}</SubscriptionPanel>;
    case "missing":
      return <SubscriptionPanel title={s.confirmTitle} message={s.missingToken} />;
    case "error":
      return (
        <SubscriptionPanel title={s.confirmTitle} message={s.errorMessage}>
          <button
            type="button"
            className={uiButtonSecondary}
            onClick={() => {
              setState("confirming");
              void confirmLink(token).then(setState);
            }}
          >
            {s.retry}
          </button>
        </SubscriptionPanel>
      );
  }
}
