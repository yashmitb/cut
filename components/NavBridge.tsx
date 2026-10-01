"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Finishes a notification tap's deep link (e.g. /add?meal=dinner). The service
// worker either messages an open app, or — when iOS cold-launches the app at the
// start page and ignores the URL — leaves it in Cache Storage for us to pick up.
const PENDING = "/__pending-nav";
const MAX_AGE_MS = 2 * 60 * 1000;

export default function NavBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const go = (raw: string) => {
      try {
        const u = new URL(raw, location.origin);
        if (u.origin !== location.origin) return;
        const target = u.pathname + u.search + u.hash;
        if (target !== location.pathname + location.search + location.hash) router.push(target);
      } catch {
        /* bad URL — ignore */
      }
    };

    const takePending = async (): Promise<string | null> => {
      try {
        if (!("caches" in window)) return null;
        const cache = await caches.open("cut-nav");
        const res = await cache.match(PENDING);
        if (!res) return null;
        await cache.delete(PENDING);
        const { url, at } = (await res.json()) as { url: string; at: number };
        return Date.now() - at < MAX_AGE_MS ? url : null;
      } catch {
        return null;
      }
    };

    const check = () => takePending().then((url) => url && go(url));
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "cut-navigate") return;
      takePending(); // consumed by the message — don't navigate twice
      go(e.data.url);
    };
    const onVisible = () => document.visibilityState === "visible" && check();

    navigator.serviceWorker.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    check();
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
