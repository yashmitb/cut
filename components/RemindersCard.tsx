"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckIcon } from "@/components/Icons";

type MealKey = "breakfast" | "lunch" | "dinner";
type Reminders = { enabled: boolean; times: Record<MealKey, string> };

const KEY = "cut.reminders.v1";
const DEFAULTS: Reminders = { enabled: false, times: { breakfast: "08:30", lunch: "12:30", dinner: "19:00" } };
const MEALS: { key: MealKey; label: string; copy: string }[] = [
  { key: "breakfast", label: "Breakfast", copy: "Log your breakfast 🍳" },
  { key: "lunch", label: "Lunch", copy: "Lunch time — don't forget to log it 🥗" },
  { key: "dinner", label: "Dinner", copy: "Log dinner to close out your day 🍽️" },
];

function load(): Reminders {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    return { enabled: !!p.enabled, times: { ...DEFAULTS.times, ...(p.times || {}) } };
  } catch {
    return DEFAULTS;
  }
}

function msUntil(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  const t = new Date();
  t.setHours(h, m, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime() - now.getTime();
}

export default function RemindersCard() {
  const [r, setR] = useState<Reminders>(DEFAULTS);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [hydrated, setHydrated] = useState(false);
  const [tested, setTested] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // hydrate from localStorage on mount (client only)
  useEffect(() => {
    setR(load());
    setPerm("Notification" in window ? Notification.permission : "unsupported");
    setHydrated(true);
  }, []);

  // persist + (re)arm the in-app scheduler whenever settings change
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(r));

    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!r.enabled || perm !== "granted") return;

    for (const { key, copy } of MEALS) {
      const time = r.times[key];
      if (!time) continue;
      const arm = (delay: number) => {
        const id = setTimeout(() => {
          try {
            new Notification("Cut", { body: copy, tag: `cut-${key}`, icon: "/icon" });
          } catch { /* ignore */ }
          arm(24 * 60 * 60 * 1000); // same time tomorrow
        }, delay);
        timers.current.push(id);
      };
      arm(msUntil(time));
    }
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [r, perm, hydrated]);

  // Safari (and old browsers) implement requestPermission with a callback and
  // resolve the promise to `undefined`. Support both, then trust the canonical
  // Notification.permission value rather than the return.
  function requestPermissionCompat(): Promise<NotificationPermission> {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(Notification.permission); } };
      try {
        const maybe = Notification.requestPermission(done);
        if (maybe && typeof (maybe as Promise<NotificationPermission>).then === "function") {
          (maybe as Promise<NotificationPermission>).then(done, done);
        }
      } catch {
        done();
      }
    });
  }

  async function enable() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") await requestPermissionCompat();
    const p = Notification.permission; // authoritative, post-prompt
    setPerm(p);
    if (p === "granted") setR((x) => ({ ...x, enabled: true }));
  }

  function test() {
    if (perm !== "granted") return;
    new Notification("Cut", { body: "Reminders are on — you'll get a nudge at each meal. ✅", icon: "/icon" });
    setTested(true);
    setTimeout(() => setTested(false), 2000);
  }

  const unsupported = perm === "unsupported";
  const blocked = perm === "denied";

  return (
    <section className="glass card p-4 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(201,184,240,0.16)", color: "var(--p-cal)" }}>
            <Bell width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Meal reminders</p>
            <p className="text-xs text-[var(--muted)]">A gentle nudge to log each meal</p>
          </div>
        </div>
        {!unsupported && (
          <button
            role="switch"
            aria-checked={r.enabled && perm === "granted"}
            aria-label="Enable meal reminders"
            onClick={() => (r.enabled ? setR((x) => ({ ...x, enabled: false })) : enable())}
            className="relative w-12 h-7 rounded-full flex-shrink-0 transition-colors pressable"
            style={{ background: r.enabled && perm === "granted" ? "var(--p-cal)" : "rgba(255,255,255,0.12)" }}
          >
            <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: r.enabled && perm === "granted" ? "22px" : "2px" }} />
          </button>
        )}
      </div>

      {unsupported && <p className="text-xs text-[var(--muted)] mt-3">This device doesn&apos;t support notifications.</p>}
      {blocked && <p className="text-xs mt-3" style={{ color: "var(--p-warn)" }}>Notifications are blocked in your browser settings — enable them there to use reminders.</p>}

      {r.enabled && perm === "granted" && (
        <div className="mt-4 flex flex-col gap-2.5 rise">
          {MEALS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <input
                type="time"
                value={r.times[key]}
                onChange={(e) => setR((x) => ({ ...x, times: { ...x.times, [key]: e.target.value } }))}
                className="field tabular !w-auto !py-2 !px-3"
                aria-label={`${label} reminder time`}
              />
            </label>
          ))}
          <button onClick={test} className="btn btn-ghost mt-1 !py-2.5 text-sm">
            {tested ? <><CheckIcon width={16} height={16} /> Sent</> : "Send a test notification"}
          </button>
          <p className="text-[11px] text-[var(--faint)] leading-relaxed">
            Reminders fire while Cut is open or running in the background. Add Cut to your home screen for the most reliable nudges.
          </p>
        </div>
      )}
    </section>
  );
}
