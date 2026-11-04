import type { Metadata } from "next";
import { HomeLink, SubscriptionPanel, TokenForm } from "@/components/subscription/subscription-panel";
import { en, zh } from "@/lib/i18n";
import { asLang } from "@/lib/seo/copy";
import { subscriptionToken } from "@/lib/subscription";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Reached from the confirmation email. Confirming takes the button (app/api/subscribe/confirm),
// which sends the reader back here with ?status=.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = asLang((await params).lang) === "zh" ? zh : en;
  return { title: t.subscription.confirmTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function ConfirmSubscriptionPage({ params, searchParams }: Props) {
  const lang = asLang((await params).lang);
  const t = lang === "zh" ? zh : en;
  const s = t.subscription;
  const { status, token: rawToken } = await searchParams;
  const token = subscriptionToken(rawToken);
  const home = <HomeLink label={t.notFound.backToDigest} />;

  if (status === "confirmed") return <SubscriptionPanel title={s.confirmed} message={s.confirmedMessage}>{home}</SubscriptionPanel>;
  if (status === "already_confirmed") return <SubscriptionPanel title={s.alreadyConfirmed} message={s.confirmedMessage}>{home}</SubscriptionPanel>;
  if (status === "invalid") return <SubscriptionPanel title={s.invalidTitle} message={s.invalidMessage}>{home}</SubscriptionPanel>;
  if (!token) return <SubscriptionPanel title={s.confirmTitle} message={s.missingToken} />;
  return (
    <SubscriptionPanel title={s.confirmTitle} message={status === "error" ? s.errorMessage : s.confirmMessage}>
      <TokenForm action="/api/subscribe/confirm" token={token} lang={lang} label={s.confirmCta} />
    </SubscriptionPanel>
  );
}
