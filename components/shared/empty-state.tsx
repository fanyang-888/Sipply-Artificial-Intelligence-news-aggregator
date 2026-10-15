import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
};

export function EmptyState({ title, description, action, children }: EmptyStateProps) {
  return (
    <div className="sp-glass px-6 py-12 text-center">
      <p className="font-display text-[1.35rem] leading-snug text-foreground">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed [color:var(--text-soft)]">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
