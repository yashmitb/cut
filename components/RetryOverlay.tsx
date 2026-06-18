"use client";

import { useSyncExternalStore } from "react";
import { cancelRetry, getRetryState, subscribeRetry } from "@/lib/retry";

export default function RetryOverlay() {
  const state = useSyncExternalStore(subscribeRetry, getRetryState, () => null);
  if (!state) return null;

  return (
    <div className="fixed top-[max(env(safe-area-inset-top),12px)] left-1/2 -translate-x-1/2 z-[100] pointer-events-none flex justify-center w-full px-4">
      <div className="glass-strong rounded-full pl-4 pr-2 py-2 flex items-center gap-3 pointer-events-auto pop">
        <span className="spin w-4 h-4 rounded-full flex-shrink-0" style={{ border: "2px solid rgba(255,255,255,0.18)", borderTopColor: "var(--p-warn)" }} />
        <span className="text-sm font-medium whitespace-nowrap">
          {state.secondsLeft > 0 ? (
            <>
              Connection hiccup — retrying in{" "}
              <span className="tabular font-bold" style={{ color: "var(--p-warn)" }}>{state.secondsLeft}</span>
            </>
          ) : (
            "Retrying…"
          )}
        </span>
        <button
          onClick={cancelRetry}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] pressable flex-shrink-0"
          aria-label="Stop retrying"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
