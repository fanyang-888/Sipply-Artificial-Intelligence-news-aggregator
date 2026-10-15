import type { ReactNode } from "react";

type NoResultsStateProps = {
  title: string;
  message?: string;
  children?: ReactNode;
};

/**
 * Filter/search produced no matches.
 */
export function NoResultsState({
  title,
  message,
  children,
}: NoResultsStateProps) {
  return (
    <div className="sp-glass px-6 py-12 text-center">
      <p className="font-display text-[1.35rem] leading-snug text-foreground">{title}</p>
      {message ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed [color:var(--text-soft)]">{message}</p>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
