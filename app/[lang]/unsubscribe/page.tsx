import type { Metadata } from "next";
import { HomeLink, SubscriptionPanel, TokenForm } from "@/components/subscription/subscription-panel";
import { en, zh } from "@/lib/i18n";
import { asLang } from "@/lib/seo/copy";
import { subscriptionToken } from "@/lib/subscription";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Reached from the link in a digest's footer. Leaving takes the button (app/api/unsubscribe),
// not just opening the link: mail scanners open links. The route sends the reader back here
// with ?status=.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = asLang((await params).lang) === "zh" ? zh : en;
  return { title: t.subscription.unsubscribeTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function UnsubscribePage({ params, searchParams }: Props) {
  const lang = asLang((await params).lang);
  const t = lang === "zh" ? zh : en;
  const s = t.subscription;
  const { status, token: rawToken } = await searchParams;
  const token = subscriptionToken(rawToken);
  const home = <HomeLink label={t.notFound.backToDigest} />;

  if (status === "unsubscribed") return <SubscriptionPanel title={s.unsubscribed} message={s.unsubscribedMessage}>{home}</SubscriptionPanel>;
  if (status === "not_subscribed") return <SubscriptionPanel title={s.notSubscribedTitle} message={s.notSubscribedMessage}>{home}</SubscriptionPanel>;
  if (!token) return <SubscriptionPanel title={s.unsubscribeTitle} message={s.missingToken} />;
  return (
    <SubscriptionPanel title={s.unsubscribeTitle} message={status === "error" ? s.errorMessage : s.unsubscribeMessage}>
      <TokenForm action="/api/unsubscribe" token={token} lang={lang} label={s.unsubscribeCta} source="page" />
    </SubscriptionPanel>
  );
}
