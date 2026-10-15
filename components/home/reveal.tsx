"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Extra delay in ms, for staggering siblings. */
  delay?: number;
};

/**
 * Fades its content up into place the first time it scrolls into view.
 *
 * The server HTML is always fully visible (crawlers, no-JS, the first paint).
 * After mount, only content that starts below the fold is hidden and then
 * revealed by an IntersectionObserver; reduced motion skips the effect in CSS.
 */
export function Reveal({ children, className = "", as: Tag = "div", delay = 0 }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  // The hidden flag is a DOM attribute set and cleared here, not React state:
  // the server render never carries it, so content is visible without JS
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already in view
    el.dataset.hidden = "true";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          delete el.dataset.hidden;
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      delete el.dataset.hidden;
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={`sp-reveal ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
