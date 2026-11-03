import type { ReactNode } from "react";
import Link from "@/components/shared/link";
import { uiButtonPrimary } from "@/lib/ui/classes";

/** The card on the pages a subscriber reaches from an email: what happened, and what next. */
export function SubscriptionPanel({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <section className="sp-glass mx-auto my-[8vh] max-w-2xl px-6 py-14 text-center">
      <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-light leading-tight text-foreground">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed [color:var(--text-soft)]">{message}</p>
      {children ? <div className="mt-8 flex justify-center">{children}</div> : null}
    </section>
  );
}

/** A form with one button that posts the subscriber's token to one of the site's routes. */
export function TokenForm({ action, token, lang, label, source }: { action: string; token: string; lang: string; label: string; source?: string }) {
  return (
    <form method="post" action={action}>
      {source ? <input type="hidden" name="source" value={source} /> : null}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="lang" value={lang} />
      <button type="submit" className={uiButtonPrimary}>
        {label}
      </button>
    </form>
  );
}

export function HomeLink({ label }: { label: string }) {
  return (
    <Link href="/" className={uiButtonPrimary}>
      {label} <span aria-hidden>→</span>
    </Link>
  );
}
