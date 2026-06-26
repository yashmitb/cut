"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Bell, CheckIcon, ChevronDown } from "@/components/Icons";

type ReminderKey = "weight" | "breakfast" | "lunch" | "dinner";
type Reminders = { enabled: boolean; times: Record<ReminderKey, string> };

const KEY = "cut.reminders.v1";
const DEFAULTS: Reminders = {
  enabled: false,
  times: { weight: "07:30", breakfast: "08:30", lunch: "12:30", dinner: "19:00" },
};
const ITEMS: { key: ReminderKey; label: string }[] = [
  { key: "weight", label: "Weigh-in" },
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const tz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

// Safari's requestPermission() historically only supports the legacy callback
// signature and resolves its Promise to `undefined` — read Notification.permission
// afterward as the source of truth instead of trusting the resolved value.
function requestPermissionCompat(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (p?: NotificationPermission) => {
      if (settled) return;
      settled = true;
      resolve(p || Notification.permission);
    };
    try {
      const maybePromise = Notification.requestPermission(finish as (p: NotificationPermission) => void);
      if (maybePromise && typeof (maybePromise as Promise<NotificationPermission>).then === "function") {
        (maybePromise as Promise<NotificationPermission>).then(finish, finish);
      }
    } catch {
      finish();
    }
  });
}

export default function RemindersCard() {
  const [r, setR] = useState<Reminders>(DEFAULTS);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<"idle" | "scheduled" | "fail">("idle");
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  const setup = useRef<{ cronSecret: string | null; cronUrl: string | null } | null>(null);
  const vapid = useRef<string | null>(null);

  useEffect(() => {
    const ok = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (ok) setPerm(Notification.permission);
    setR(load());
  }, []);

  const persist = (next: Reminders) => {
    setR(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // get the active push subscription, subscribing if needed
  const getSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (!vapid.current) {
        const info = await api.getPush();
        vapid.current = info.vapidPublicKey;
        setup.current = { cronSecret: info.cronSecret, cronUrl: info.cronUrl };
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.current) as BufferSource,
      });
    } else if (!setup.current) {
      const info = await api.getPush().catch(() => null);
      if (info) setup.current = { cronSecret: info.cronSecret, cronUrl: info.cronUrl };
    }
    return sub;
  }, []);

  const syncToServer = useCallback(async (next: Reminders) => {
    const sub = await getSubscription();
    if (!sub) throw new Error("Could not subscribe to notifications.");
    await api.savePush({ subscription: sub.toJSON() as PushSubscriptionJSON, reminders: next, timezone: tz() });
  }, [getSubscription]);

  async function enable() {
    if (supported !== true) return;
    setBusy(true);
    try {
      let p = Notification.permission;
      if (p !== "granted") p = await requestPermissionCompat();
      setPerm(p);
      if (p !== "granted") return;
      const next = { ...r, enabled: true };
      await syncToServer(next);
      persist(next);
      if (setup.current?.cronSecret) setShowSetup(true); // surface delivery setup the first time (owner only)
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await api.deletePush(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
      persist({ ...r, enabled: false });
    } finally {
      setBusy(false);
    }
  }

  // push schedule changes to the server while enabled (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setTime(key: ReminderKey, value: string) {
    const next = { ...r, times: { ...r.times, [key]: value } };
    persist(next);
    if (!next.enabled || perm !== "granted") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { syncToServer(next).catch(() => {}); }, 600);
  }

  // Schedules a synthetic "test" reminder for right now and routes it through
  // the exact same dueReminders/cron path real reminders use — the next real
  // cron tick (cron-job.org / GitHub Actions) is what actually sends it.
  async function test() {
    setBusy(true);
    try {
      const sub = await getSubscription();
      if (!sub) throw new Error("Could not subscribe to notifications.");
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const reminders = { enabled: true, times: { ...r.times, test: hhmm } };
      const res = await api.savePush({ subscription: sub.toJSON() as PushSubscriptionJSON, reminders, timezone: tz(), cronTest: true });
      setTested(res.ok ? "scheduled" : "fail");
    } catch {
      setTested("fail");
    } finally {
      setBusy(false);
      setTimeout(() => setTested("idle"), 60000);
    }
  }

  function copySecret() {
    if (!setup.current?.cronSecret) return;
    navigator.clipboard?.writeText(setup.current.cronSecret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  const on = r.enabled && perm === "granted";

  return (
    <section className="glass card p-4 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(201,184,240,0.16)", color: "var(--p-cal)" }}>
            <Bell width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Reminders</p>
            <p className="text-xs text-[var(--muted)]">Nudges to log meals &amp; your weight</p>
          </div>
        </div>
        {supported === true && (
          <button
            role="switch"
            aria-checked={on}
            aria-label="Enable reminders"
            disabled={busy}
            onClick={() => (r.enabled ? disable() : enable())}
            className="relative w-12 h-7 rounded-full flex-shrink-0 transition-colors pressable disabled:opacity-60"
            style={{ background: on ? "var(--p-cal)" : "rgba(255,255,255,0.12)" }}
          >
            <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: on ? "22px" : "2px" }} />
          </button>
        )}
      </div>

      {supported === false && (
        <p className="text-xs text-[var(--muted)] mt-3">
          To get reminders on iPhone, add Cut to your Home Screen first (Share → Add to Home Screen), then open it from there. On desktop, use Chrome, Edge, Safari, or Firefox.
        </p>
      )}
      {supported === true && perm === "denied" && (
        <p className="text-xs mt-3" style={{ color: "var(--p-warn)" }}>Notifications are blocked in your browser settings — enable them there to use reminders.</p>
      )}

      {on && (
        <div className="mt-4 flex flex-col gap-2.5 rise">
          {ITEMS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <input
                type="time"
                value={r.times[key]}
                onChange={(e) => setTime(key, e.target.value)}
                className="field tabular !w-auto !py-2 !px-3"
                aria-label={`${label} reminder time`}
              />
            </label>
          ))}

          <button onClick={test} disabled={busy} className="btn btn-ghost mt-1 !py-2.5 text-sm">
            {tested === "scheduled" ? <><CheckIcon width={16} height={16} /> Scheduled — wait ~1 min for the real cron job</> : tested === "fail" ? "Couldn't schedule — try again" : "Test via real cron job"}
          </button>

          {/* delivery setup — the free cron that fires reminders when the app is closed (owner only) */}
          {setup.current?.cronSecret && (
            <>
              <button onClick={() => setShowSetup((s) => !s)} className="flex items-center justify-between text-xs text-[var(--muted)] mt-1 pressable" aria-expanded={showSetup}>
                <span>One-time delivery setup</span>
                <ChevronDown width={14} height={14} style={{ transform: showSetup ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
              {showSetup && (
                <div className="text-[11px] text-[var(--muted)] leading-relaxed flex flex-col gap-2 rise" style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "10px 12px" }}>
                  <p>Reminders are sent by a free scheduler that pings Cut every few minutes. A GitHub Action is already included in the repo — just add this secret once:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate text-[var(--fg)]" style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "4px 8px" }}>
                      CRON_SECRET = {setup.current.cronSecret.slice(0, 10)}…
                    </code>
                    <button onClick={copySecret} className="chip pressable flex-shrink-0">{copied ? "Copied" : "Copy"}</button>
                  </div>
                  <p>Add it at <span className="text-[var(--fg)]">GitHub → repo → Settings → Secrets → Actions → New secret</span>. No GitHub? Paste the full cron URL into any free scheduler (cron-job.org) on a 5-minute interval.</p>
                </div>
              )}
            </>
          )}

          <p className="text-[11px] text-[var(--faint)] leading-relaxed">
            On iPhone, open Cut from your Home Screen for notifications to arrive.
          </p>
        </div>
      )}
    </section>
  );
}
