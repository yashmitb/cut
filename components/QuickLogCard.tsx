"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { CheckIcon, ChevronDown, CopyIcon, Mic, ScaleIcon, Smartphone, StarFilledIcon, Zap } from "@/components/Icons";

// "Log from your Home Screen": iPhone web apps can't have widgets or icon
// shortcuts, but Apple's Shortcuts app can call a URL — and Shortcuts can live
// on the Home Screen (widget), Lock Screen / Control Center, the Action Button,
// Back Tap, or Siri. This card hands out a personal link and step-by-step recipes.

const STORE = "cut.quickToken.v1";
const tz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

function loadLocal(): { token: string; last4: string } | null {
  try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; }
}

export default function QuickLogCard() {
  const [status, setStatus] = useState<{ enabled: boolean; last4?: string; last_used_at?: string | null } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [foods, setFoods] = useState<{ name: string; fav: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>("menu");
  const [tryMsg, setTryMsg] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getQuickToken(tz())
      .then((s) => {
        setStatus(s);
        const local = loadLocal();
        if (s.enabled && local && local.last4 === s.last4) setToken(local.token);
      })
      .catch((e) => { if (!isCancel(e)) setError((e as Error).message); });
  }, []);

  useEffect(() => {
    if (!token) return;
    api.getRecent()
      .then(({ favorites, items }) => {
        const seen = new Set<string>();
        const list = [
          ...favorites.map((f) => ({ name: f.name, fav: true })),
          ...items.map((i) => ({ name: i.name, fav: false })),
        ].filter((f) => !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase()));
        setFoods(list.slice(0, 12));
      })
      .catch(() => {});
  }, [token]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { token, last4 } = await api.createQuickToken(tz());
      try { localStorage.setItem(STORE, JSON.stringify({ token, last4 })); } catch { /* private mode */ }
      setToken(token);
      setStatus({ enabled: true, last4, last_used_at: null });
      setConfirmOff(false);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await api.revokeQuickToken();
      try { localStorage.removeItem(STORE); } catch { /* ignore */ }
      setToken(null);
      setStatus({ enabled: false });
      setConfirmOff(false);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function tryIt() {
    if (!token) return;
    setTryMsg("…");
    try {
      const r = await fetch(`/api/quick?t=${encodeURIComponent(token)}&status=1`);
      setTryMsg((r.ok ? "✓ Link works — " : "✗ ") + (await r.text()));
    } catch {
      setTryMsg("✗ Couldn't reach Cut.");
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base = token ? `${origin}/api/quick?t=${token}` : "";

  return (
    <section className="glass card p-4 mb-4" aria-labelledby="quicklog-title">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(181,232,201,0.16)", color: "var(--p-fiber)" }}>
          <Smartphone width={18} height={18} />
        </span>
        <div className="min-w-0">
          <p id="quicklog-title" className="text-sm font-semibold">Log from your Home Screen</p>
          <p className="text-xs text-[var(--muted)]">One-tap buttons, Siri, Lock Screen &amp; Action Button</p>
        </div>
      </div>

      {error && <p className="text-xs mt-3" style={{ color: "var(--p-warn)" }}>{error}</p>}

      {status && !status.enabled && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Log your go-to foods without opening Cut — from a Home Screen widget, the Lock Screen, the Action Button, or by asking Siri. It uses Apple&apos;s free Shortcuts app and a private link only you have.
          </p>
          <button onClick={create} disabled={busy} className="btn btn-primary !py-2.5 text-sm">
            <Zap width={16} height={16} /> Set it up
          </button>
        </div>
      )}

      {status?.enabled && !token && (
        <div className="mt-3 flex flex-col gap-2.5">
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Your quick-log link (…{status.last4}) is on, but this device doesn&apos;t have it.
            {status.last_used_at ? ` Last used ${new Date(status.last_used_at).toLocaleDateString()}.` : ""} Make a new one to see the setup steps here — Shortcuts using the old link will need updating.
          </p>
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="btn btn-ghost flex-1 !py-2.5 text-sm">Make a new link</button>
            <button onClick={turnOff} disabled={busy} className="btn btn-ghost !py-2.5 text-sm" style={{ color: "var(--p-warn)" }}>Turn off</button>
          </div>
        </div>
      )}

      {token && (
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <button onClick={tryIt} className="chip pressable">Test my link</button>
            {tryMsg && <span className="text-[11px] text-[var(--muted)] min-w-0">{tryMsg}</span>}
          </div>

          <Recipe id="menu" open={open} setOpen={setOpen} icon={<StarFilledIcon width={14} height={14} />} title="Quick menu (start here)" sub="One button that lists your starred foods — tap one, it's logged">
            <Step n={1}>Open the <b>Shortcuts</b> app → <b>+</b> → name it <b>Log food</b>.</Step>
            <Step n={2}>Add <b>Get Contents of URL</b> and paste:<Copy value={`${base}&list=1`} /></Step>
            <Step n={3}>Add <b>Split Text</b> (by New Lines), then <b>Choose from List</b>.</Step>
            <Step n={4}>
              Add another <b>Get Contents of URL</b> with:<Copy value={base} />
              Tap <b>Show More</b> → Method <b>POST</b> → Request Body <b>JSON</b> → add a Text field named <code>food</code> set to <b>Chosen Item</b>.
            </Step>
            <Step n={5}>Add <b>Show Notification</b> (it shows what was logged and what&apos;s left).</Step>
            <p className="text-[11px] text-[var(--faint)] leading-relaxed">
              The menu always shows your <StarFilledIcon width={10} height={10} className="inline -mt-0.5" style={{ color: "var(--p-fat)" }} /> starred foods first, then recent ones — star or unstar foods on the <Link href="/add" className="underline">Add</Link> screen to change it. Logs go to the meal for the time of day.
            </p>
          </Recipe>

          <Recipe id="one" open={open} setOpen={setOpen} icon={<Zap width={14} height={14} />} title="One-tap food buttons" sub="A button per food, e.g. your daily shake">
            <Step n={1}>New shortcut → <b>Get Contents of URL</b> with the food&apos;s link below → then <b>Show Notification</b>.</Step>
            <Step n={2}>Name it after the food and pick an icon. Repeat for each go-to.</Step>
            {foods.length === 0 ? (
              <p className="text-[11px] text-[var(--faint)]">Log a few foods first — their links will show up here.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {foods.map((f) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="text-xs flex-1 min-w-0 truncate">{f.fav ? "★ " : ""}{f.name}</span>
                    <CopyButton value={`${base}&food=${encodeURIComponent(f.name)}`} label={`Copy link for ${f.name}`} />
                  </div>
                ))}
                <p className="text-[11px] text-[var(--faint)]">Add <code>&amp;x=2</code> to a link for a double portion.</p>
              </div>
            )}
          </Recipe>

          <Recipe id="voice" open={open} setOpen={setOpen} icon={<Mic width={14} height={14} />} title="Say it — “Hey Siri, tell Cut”" sub="Describe anything; AI logs it">
            <Step n={1}>New shortcut named <b>Tell Cut</b> → add <b>Dictate Text</b>.</Step>
            <Step n={2}>
              Add <b>Get Contents of URL</b>:<Copy value={base} />
              Method <b>POST</b>, Request Body <b>JSON</b>, Text field <code>say</code> = <b>Dictated Text</b>.
            </Step>
            <Step n={3}>Add <b>Show Notification</b>. Now say “Hey Siri, tell Cut”, then “two eggs and a slice of toast”.</Step>
          </Recipe>

          <Recipe id="weight" open={open} setOpen={setOpen} icon={<ScaleIcon width={14} height={14} />} title="Weigh-in & what's left" sub="Log weight from the Lock Screen; check your budget">
            <Step n={1}>Weight: <b>Ask for Input</b> (Number) → <b>Get Contents of URL</b> POST JSON, Number field <code>weight</code> = <b>Provided Input</b>:<Copy value={base} /> → <b>Show Notification</b>.</Step>
            <Step n={2}>What&apos;s left today: <b>Get Contents of URL</b> → <b>Show Notification</b>:<Copy value={`${base}&status=1`} /></Step>
          </Recipe>

          <Recipe id="place" open={open} setOpen={setOpen} icon={<Smartphone width={14} height={14} />} title="Put them where you'll tap them" sub="Home Screen, Lock Screen, Action Button, Back Tap">
            <ul className="text-xs text-[var(--muted)] leading-relaxed flex flex-col gap-1.5 list-disc pl-4">
              <li><b className="text-[var(--fg)]">Home Screen widget:</b> put your Cut shortcuts in a Shortcuts folder → long-press the Home Screen → Edit → Add Widget → Shortcuts → choose that folder. You pick exactly which buttons show.</li>
              <li><b className="text-[var(--fg)]">Lock Screen / Control Center</b> (iOS 18+): edit Control Center or the Lock Screen buttons → Add a Control → Shortcut.</li>
              <li><b className="text-[var(--fg)]">Action Button</b> (iPhone 15 Pro and later): Settings → Action Button → Shortcut → Log food.</li>
              <li><b className="text-[var(--fg)]">Back Tap:</b> Settings → Accessibility → Touch → Back Tap → Double Tap → Log food.</li>
              <li><b className="text-[var(--fg)]">Siri:</b> say any shortcut&apos;s name.</li>
            </ul>
          </Recipe>

          <div className="flex items-center justify-between gap-2 mt-1">
            <p className="text-[11px] text-[var(--faint)] leading-snug">Keep this link private — anyone with it can log to your account.</p>
            {confirmOff ? (
              <span className="flex gap-1.5 flex-shrink-0">
                <button onClick={create} disabled={busy} className="chip pressable">New link</button>
                <button onClick={turnOff} disabled={busy} className="chip pressable" style={{ color: "var(--p-warn)" }}>Turn off</button>
              </span>
            ) : (
              <button onClick={() => setConfirmOff(true)} className="text-[11px] text-[var(--muted)] underline pressable flex-shrink-0">Reset…</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Recipe({ id, open, setOpen, icon, title, sub, children }: {
  id: string; open: string | null; setOpen: (v: string | null) => void;
  icon: React.ReactNode; title: string; sub: string; children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
      <button onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} className="w-full flex items-center gap-2.5 p-3 text-left pressable">
        <span className="flex-shrink-0" style={{ color: "var(--p-cal)" }}>{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-[11px] text-[var(--muted)]">{sub}</span>
        </span>
        <ChevronDown width={15} height={15} className="text-[var(--faint)] flex-shrink-0" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {isOpen && <div className="px-3 pb-3 flex flex-col gap-2.5 rise">{children}</div>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-xs leading-relaxed">
      <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ background: "rgba(201,184,240,0.16)", color: "var(--p-cal)" }}>{n}</span>
      <div className="min-w-0 flex-1 text-[var(--muted)] [&_b]:text-[var(--fg)] [&_b]:font-semibold">{children}</div>
    </div>
  );
}

function Copy({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <code className="flex-1 min-w-0 truncate text-[11px] text-[var(--fg)] px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>{value}</code>
      <CopyButton value={value} label="Copy link" />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      /* clipboard blocked — the link is visible to select manually */
    }
  }
  return (
    <button onClick={copy} className="chip pressable flex-shrink-0" aria-label={label}>
      {done ? <CheckIcon width={12} height={12} /> : <CopyIcon width={12} height={12} />} {done ? "Copied" : "Copy"}
    </button>
  );
}
