import type { ReactNode } from "react";
import { Reveal } from "@/components/home/reveal";

type HomePanelProps = {
  id?: string;
  /** Two-line centred heading; the second line is quieter. */
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * One full-screen block of the home page: a centred heading and one body,
 * at least a viewport tall minus the sticky masthead (57px), so each scroll
 * lands on a complete panel. No scroll snapping: native scrolling stays untouched.
 */
export function HomePanel({ id, title, subtitle, children, className = "" }: HomePanelProps) {
  return (
    <section
      id={id}
      className={`relative flex min-h-[calc(100svh-3.6rem)] scroll-mt-14 flex-col justify-center py-10 sm:py-12 ${className}`.trim()}
    >
      {title ? (
        <Reveal className="mx-auto mb-8 max-w-3xl text-center sm:mb-10">
          <h2
            className="font-display font-light text-[clamp(1.85rem,3.3vw,2.9rem)] leading-[1.08] tracking-[-0.02em] text-foreground"
          >
            {title}
          </h2>
          {subtitle ? <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed [color:var(--text-soft)]">{subtitle}</p> : null}
        </Reveal>
      ) : null}
      <Reveal>{children}</Reveal>
    </section>
  );
}
