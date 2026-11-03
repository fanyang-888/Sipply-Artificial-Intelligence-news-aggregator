import type { ReactNode } from "react";

/** The card on the pages a subscriber reaches from an email: what happened, and what next. */
export function SubscriptionPanel({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  return (
    <section className="sp-glass mx-auto my-[8vh] max-w-2xl px-6 py-14 text-center" aria-live="polite">
      <h1 className="font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-light leading-tight text-foreground">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed [color:var(--text-soft)]">{message}</p>
      {children ? <div className="mt-8 flex justify-center">{children}</div> : null}
    </section>
  );
}
