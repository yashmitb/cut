"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates a number from its previous value to the next one.
 * Starts from 0 on first mount, eases out, and respects reduced-motion.
 */
export function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const to = value;
    const from = current.current;
    if (reduce || from === to) {
      current.current = to;
      setDisplay(to);
      return;
    }

    let raf = 0;
    let start = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const v = from + (to - from) * ease(p);
      current.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else current.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return Math.round(display);
}
