/**
 * Shared Tailwind class strings: one visual language on every page (the home
 * page's panels): Fraunces titles, mono micro-labels, glass panels (`sp-glass`
 * in globals.css), pill buttons, and one accent colour.
 */

/** Page title (h1): Fraunces light, large, balanced. */
export const uiPageTitle =
  "font-display text-[clamp(2.3rem,4.6vw,3.75rem)] font-light leading-[1.06] tracking-[-0.02em] text-foreground [text-wrap:balance]";

/** The paragraph under a page title. */
export const uiPageDescription =
  "mt-4 max-w-2xl text-[16px] leading-relaxed [color:var(--text-soft)] sm:text-[17px]";

/** Section title (h2) inside a page. */
export const uiSectionTitle =
  "mb-4 font-display text-[1.45rem] font-normal leading-tight tracking-[-0.01em] text-foreground";

/** Metadata in small mono capitals: categories, dates, counts. Never body text. */
export const uiMicroLabel =
  "font-mono text-[11px] uppercase tracking-[0.14em] [color:var(--text-muted)]";

/** Text tab (categories, sort): mono capitals with an accent underline when on. */
export function uiTab(on: boolean): string {
  return [
    "shrink-0 border-b pb-1 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
    on ? "text-foreground [border-color:var(--accent)]" : "border-transparent [color:var(--text-muted)] hover:text-foreground",
  ].join(" ");
}

/** Text input / select on a glass page. */
export const uiInput =
  "h-9 rounded-full px-4 text-[13px] text-foreground outline-none ring-1 ring-inset [--tw-ring-color:var(--panel-divider)] [background:var(--panel-fill-2)] placeholder:[color:var(--text-muted)] focus:[--tw-ring-color:var(--accent)]";

/** The page's main action: a light pill (dark pill in the light theme). */
export const uiButtonPrimary =
  "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium no-underline transition-opacity hover:opacity-90 [background:var(--cta-bg)] [color:var(--cta-text)]";

/** Secondary action: a quiet pill. */
export const uiButtonSecondary =
  "inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13.5px] font-medium text-foreground ring-1 ring-inset transition-colors [--tw-ring-color:var(--panel-divider)] [background:var(--panel-fill-2)] hover:[--tw-ring-color:var(--accent)] disabled:opacity-50";

/** Inline link in the accent colour. */
export const uiTextLinkPrimary =
  "text-sm font-medium no-underline [color:var(--accent)] underline-offset-4 hover:underline";
