import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmSubscription } from "@/components/subscription/confirm-subscription";
import { SubscriptionPanel } from "@/components/subscription/subscription-panel";
import { en, zh } from "@/lib/i18n";
import { asLang } from "@/lib/seo/copy";

type Props = { params: Promise<{ lang: string }> };

// Reached only from a confirmation email; the token in the link is read in the browser
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = asLang((await params).lang) === "zh" ? zh : en;
  return { title: t.subscription.confirmTitle, robots: { index: false, follow: false } };
}

export default async function ConfirmSubscriptionPage({ params }: Props) {
  const t = asLang((await params).lang) === "zh" ? zh : en;
  return (
    <Suspense fallback={<SubscriptionPanel title={t.subscription.confirmTitle} message={t.subscription.confirming} />}>
      <ConfirmSubscription />
    </Suspense>
  );
}
