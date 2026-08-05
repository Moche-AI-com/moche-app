'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

// Scroll-reveal wrapper.
//
// Uses a single IntersectionObserver per instance and disconnects on first
// intersection, so there is no scroll listener and no work after the element
// has appeared. The visual transition lives in .reveal (app/globals.css) and
// animates opacity + transform only, which stays off the layout path.
//
// prefers-reduced-motion is handled in CSS rather than here on purpose: if it
// were handled in JS, a reduced-motion visitor whose observer never fired
// would be left with invisible content. In CSS the end state is forced.
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className,
  id,
  eager = false,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Stagger in ms. Keep under ~240ms; longer reads as lag, not choreography. */
  delay?: number;
  className?: string;
  id?: string;
  /**
   * Set on content that is above the fold at load.
   *
   * An eager instance plays its entrance from CSS the moment styles apply,
   * instead of waiting for this component to hydrate and its observer to fire.
   * Hydration is ~300ms behind first paint even on a fast connection, and the
   * hero is the LCP element -- gating it on JS means the page reads as blank
   * below the header for that whole window, and far longer on a slow device.
   *
   * Only worth it for the first screen. Below-the-fold content is not visible
   * during that window anyway, and giving it a CSS animation would make it
   * play before it is scrolled to.
   */
  eager?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Fallback for environments without IntersectionObserver (older Safari,
    // some test runners): show immediately rather than hiding content.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    // Anything already on screen at mount (the hero) reveals right away.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={className ? `reveal ${className}` : 'reveal'}
      data-shown={shown ? 'true' : 'false'}
      data-eager={eager ? '' : undefined}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
