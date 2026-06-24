"use client";

import { useEffect, useMemo, useState } from "react";

const COLORS = ["#c9b8f0", "#f6a6b8", "#a8d0f0", "#f7d9a0", "#b5e8c9", "#f7c59f"];

/**
 * A one-shot confetti burst centered horizontally near the top.
 * Mount it conditionally (or flip `show`) — it cleans itself up via `onDone`.
 * Respects prefers-reduced-motion (CSS hides the pieces).
 */
export default function Celebrate({ show, onDone, count = 26 }: { show: boolean; onDone?: () => void; count?: number }) {
  const [on, setOn] = useState(show);

  useEffect(() => {
    if (!show) return;
    setOn(true);
    const t = setTimeout(() => { setOn(false); onDone?.(); }, 1200);
    return () => clearTimeout(t);
  }, [show, onDone]);

  // stable random trajectories for this burst
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI - Math.PI / 2; // upward-ish fan
        const dist = 90 + Math.random() * 170;
        return {
          tx: Math.cos(angle) * dist * (Math.random() < 0.5 ? -1 : 1),
          ty: -(60 + Math.random() * 200),
          rot: (Math.random() * 720 - 360),
          dur: 0.9 + Math.random() * 0.5,
          delay: Math.random() * 0.08,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          w: 6 + Math.random() * 6,
          h: 9 + Math.random() * 7,
          left: 50 + (Math.random() * 24 - 12), // % across the screen
        };
      }),
    [count]
  );

  if (!on) return null;

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="absolute" style={{ top: "26%", left: 0, right: 0, height: 0 }}>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              width: p.w,
              height: p.h,
              background: p.color,
              // CSS custom props consumed by the @keyframes confetti animation
              ["--tx" as string]: `${p.tx}px`,
              ["--ty" as string]: `${p.ty}px`,
              ["--rot" as string]: `${p.rot}deg`,
              ["--dur" as string]: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
