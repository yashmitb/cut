"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import {
  ACTIVITY_LABELS,
  RATE_LABELS,
  cmToIn,
  computeTargets,
  inToCm,
  kgToLb,
  lbToKg,
  todayLocal,
  type TargetInput,
} from "@/lib/nutrition";
import type { Activity, Profile, Rate, Sex, Units } from "@/lib/types";
import { CheckIcon, ScaleIcon, WarnIcon } from "@/components/Icons";
import ApiKeyCard from "@/components/ApiKeyCard";
import AccountCard from "@/components/AccountCard";
import AppLoader from "@/components/AppLoader";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [weightSaved, setWeightSaved] = useState(false);

  // editable fields
  const [f, setF] = useState({
    name: "",
    sex: "male" as Sex,
    age: "",
    units: "imperial" as Units,
    heightCm: "",
    heightFt: "",
    heightIn: "",
    weight: "",
    goal: "",
    activity: "moderate" as Activity,
    rate: "moderate" as Rate,
  });
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, ...p }));

  useEffect(() => {
    (async () => {
      try {
        const { profile } = await api.getProfile();
        if (profile) {
          setProfile(profile);
          hydrate(profile);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function hydrate(p: Profile) {
    const units = p.units;
    const totalIn = Math.round(cmToIn(p.height_cm));
    setF({
      name: p.name ?? "",
      sex: p.sex,
      age: String(p.age),
      units,
      heightCm: String(Math.round(p.height_cm)),
      heightFt: String(Math.floor(totalIn / 12)),
      heightIn: String(totalIn % 12),
      weight: String(units === "metric" ? Math.round(p.weight_kg * 10) / 10 : Math.round(kgToLb(p.weight_kg) * 10) / 10),
      goal: String(units === "metric" ? Math.round(p.goal_weight_kg * 10) / 10 : Math.round(kgToLb(p.goal_weight_kg) * 10) / 10),
      activity: p.activity,
      rate: p.rate,
    });
  }

  const metric = useMemo((): TargetInput | null => {
    const age = Number(f.age);
    const height_cm = f.units === "metric" ? Number(f.heightCm) : inToCm(Number(f.heightFt || 0) * 12 + Number(f.heightIn || 0));
    const weight_kg = f.units === "metric" ? Number(f.weight) : lbToKg(Number(f.weight));
    const goal_weight_kg = f.units === "metric" ? Number(f.goal) : lbToKg(Number(f.goal));
    if (!age || !height_cm || !weight_kg || !goal_weight_kg) return null;
    return { age, sex: f.sex, height_cm, weight_kg, goal_weight_kg, activity: f.activity, rate: f.rate };
  }, [f]);

  const targets = useMemo(() => (metric ? computeTargets(metric) : null), [metric]);

  async function save() {
    if (!metric) return;
    setSaving(true);
    setSaved(false);
    try {
      const { profile } = await api.saveProfile({ name: f.name.trim() || null, units: f.units, ...metric });
      setProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      if (!isCancel(e)) alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function logWeight() {
    const val = Number(weightInput);
    if (!val) return;
    const kg = f.units === "metric" ? val : lbToKg(val);
    try {
      await api.addWeight(todayLocal(), kg);
      setWeightInput("");
      setWeightSaved(true);
      setF((o) => ({ ...o, weight: String(val) }));
      setTimeout(() => setWeightSaved(false), 2000);
    } catch (e) {
      if (!isCancel(e)) alert((e as Error).message);
    }
  }

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4 pb-24" style={{ background: "var(--bg)" }}>
        <AppLoader full={false} label="Loading profile…" />
      </main>
    );
  }

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),20px)] pb-32">
      <header className="mb-5 rise">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        {profile?.name && <p className="text-[var(--muted)]">{profile.name}</p>}
      </header>

      {/* account / sign out */}
      <AccountCard />

      {/* current plan summary */}
      {targets && (
        <section className="glass card p-5 mb-4 rise rise-1">
          <p className="label mb-2">Current daily targets</p>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold tabular">{targets.target_calories}</span>
            <span className="text-[var(--muted)]">kcal</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Macro label="Protein" v={targets.target_protein} c="var(--p-protein)" />
            <Macro label="Carbs" v={targets.target_carbs} c="var(--p-carbs)" />
            <Macro label="Fat" v={targets.target_fat} c="var(--p-fat)" />
            <Macro label="Fiber" v={targets.target_fiber} c="var(--p-fiber)" />
          </div>
          <div className="flex justify-around mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <Mini label="TDEE" v={`${targets.tdee}`} />
            <Mini label="Deficit" v={`${targets.deficit}`} />
            <Mini label="Per week" v={`${targets.projectedWeeklyKg.toFixed(2)}kg`} />
            <Mini label="To goal" v={targets.weeksToGoal ? `${targets.weeksToGoal}w` : "—"} />
          </div>
        </section>
      )}

      {/* log weight */}
      <section className="glass card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span style={{ color: "var(--p-fiber)" }}><ScaleIcon width={18} height={18} /></span>
          <p className="text-sm font-semibold">Log today's weight</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input className="field tabular pr-12" inputMode="decimal" placeholder={f.weight} value={weightInput} onChange={(e) => setWeightInput(e.target.value.replace(/[^\d.]/g, ""))} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--faint)]">{f.units === "metric" ? "kg" : "lb"}</span>
          </div>
          <button onClick={logWeight} disabled={!weightInput} className="btn btn-ghost">
            {weightSaved ? <CheckIcon width={18} height={18} /> : "Log"}
          </button>
        </div>
      </section>

      {/* AI connection */}
      <ApiKeyCard />

      {/* editable stats */}
      <section className="glass card p-5 mb-4 flex flex-col gap-5">
        <p className="label">Your details</p>

        <Field label="Name">
          <input className="field" value={f.name} placeholder="Your name" onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Sex">
            <div className="seg">
              {(["male", "female"] as Sex[]).map((x) => (
                <div key={x} className="seg-item !text-xs" data-on={f.sex === x} onClick={() => set({ sex: x })}>{x === "male" ? "Male" : "Female"}</div>
              ))}
            </div>
          </Field>
          <Field label="Age">
            <input className="field tabular" inputMode="numeric" value={f.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>

        <Field label="Units">
          <div className="seg">
            {(["imperial", "metric"] as Units[]).map((u) => (
              <div key={u} className="seg-item !text-xs" data-on={f.units === u} onClick={() => set({ units: u })}>{u === "imperial" ? "lb / ft" : "kg / cm"}</div>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Height">
            {f.units === "metric" ? (
              <div className="relative">
                <input className="field tabular pr-10" inputMode="numeric" value={f.heightCm} onChange={(e) => set({ heightCm: e.target.value.replace(/\D/g, "") })} />
                <Suffix>cm</Suffix>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1"><input className="field tabular pr-8" inputMode="numeric" value={f.heightFt} onChange={(e) => set({ heightFt: e.target.value.replace(/\D/g, "") })} /><Suffix>ft</Suffix></div>
                <div className="relative flex-1"><input className="field tabular pr-8" inputMode="numeric" value={f.heightIn} onChange={(e) => set({ heightIn: e.target.value.replace(/\D/g, "") })} /><Suffix>in</Suffix></div>
              </div>
            )}
          </Field>
          <Field label="Goal weight">
            <div className="relative">
              <input className="field tabular pr-10" inputMode="decimal" value={f.goal} onChange={(e) => set({ goal: e.target.value.replace(/[^\d.]/g, "") })} />
              <Suffix>{f.units === "metric" ? "kg" : "lb"}</Suffix>
            </div>
          </Field>
        </div>

        <Field label="Activity level">
          <select className="field" value={f.activity} onChange={(e) => set({ activity: e.target.value as Activity })}>
            {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => (
              <option key={a} value={a} style={{ background: "#15151c" }}>{ACTIVITY_LABELS[a].title} — {ACTIVITY_LABELS[a].sub}</option>
            ))}
          </select>
        </Field>

        <Field label="Cut aggressiveness">
          <div className="flex flex-col gap-2">
            {(Object.keys(RATE_LABELS) as Rate[]).map((r) => (
              <button key={r} onClick={() => set({ rate: r })} className="card p-3 flex items-center justify-between text-left pressable"
                style={{ border: f.rate === r ? "1px solid rgba(201,184,240,0.5)" : "1px solid var(--line)", background: f.rate === r ? "rgba(201,184,240,0.08)" : "transparent" }}>
                <div>
                  <p className="text-sm font-semibold">{RATE_LABELS[r].title}</p>
                  <p className="text-xs text-[var(--muted)]">{RATE_LABELS[r].sub}</p>
                </div>
                {f.rate === r && <span style={{ color: "var(--p-cal)" }}><CheckIcon width={16} height={16} /></span>}
              </button>
            ))}
          </div>
        </Field>

        {targets && targets.warnings.length > 0 && (
          <div className="flex flex-col gap-2">
            {targets.warnings.map((w, i) => (
              <div key={i} className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: "rgba(247,197,159,0.09)", border: "1px solid rgba(247,197,159,0.2)" }}>
                <span style={{ color: "var(--p-warn)" }} className="flex-shrink-0"><WarnIcon width={15} height={15} /></span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <button className="btn btn-primary w-full" disabled={saving || !metric} onClick={save}>
        {saved ? <><CheckIcon width={18} height={18} /> Saved</> : saving ? "Saving…" : "Save & recalculate"}
      </button>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
function Suffix({ children }: { children: React.ReactNode }) {
  return <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--faint)] pointer-events-none">{children}</span>;
}
function Macro({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="flex flex-col items-center py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
      <span className="text-base font-bold tabular" style={{ color: c }}>{v}</span>
      <span className="text-[10px] text-[var(--muted)]">{label}</span>
    </div>
  );
}
function Mini({ label, v }: { label: string; v: string }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold tabular">{v}</p>
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
    </div>
  );
}
