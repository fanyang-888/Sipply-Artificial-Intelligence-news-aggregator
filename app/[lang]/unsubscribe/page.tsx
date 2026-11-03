import type { Metadata } from "next";
import { Suspense } from "react";
import { SubscriptionPanel } from "@/components/subscription/subscription-panel";
import { UnsubscribeForm } from "@/components/subscription/unsubscribe-form";
import { en, zh } from "@/lib/i18n";
import { asLang } from "@/lib/seo/copy";

type Props = { params: Promise<{ lang: string }> };

// Reached from the link in a digest's footer; the token in the link is read in the browser
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = asLang((await params).lang) === "zh" ? zh : en;
  return { title: t.subscription.unsubscribeTitle, robots: { index: false, follow: false } };
}

export default async function UnsubscribePage({ params }: Props) {
  const t = asLang((await params).lang) === "zh" ? zh : en;
  return (
    <Suspense fallback={<SubscriptionPanel title={t.subscription.unsubscribeTitle} message={t.subscription.unsubscribeMessage} />}>
      <UnsubscribeForm />
    </Suspense>
  );
}
