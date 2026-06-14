"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  ACTIVITY_LABELS,
  RATE_LABELS,
  computeTargets,
  inToCm,
  lbToKg,
  type TargetInput,
} from "@/lib/nutrition";
import type { Activity, Rate, Sex, Units } from "@/lib/types";
import { CheckIcon, ChevronLeft, WarnIcon } from "@/components/Icons";

interface State {
  name: string;
  sex: Sex;
  age: string;
  units: Units;
  heightCm: string; // metric input
  heightFt: string;
  heightIn: string;
  weight: string; // in chosen units
  goal: string; // in chosen units
  activity: Activity;
  rate: Rate;
}

const STEPS = ["You", "Body", "Activity", "Goal", "Plan"] as const;

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<State>({
    name: "",
    sex: "male",
    age: "",
    units: "imperial",
    heightCm: "",
    heightFt: "",
    heightIn: "",
    weight: "",
    goal: "",
    activity: "moderate",
    rate: "moderate",
  });
  const set = (p: Partial<State>) => setS((o) => ({ ...o, ...p }));

  const metric = useMemo((): TargetInput | null => {
    const age = Number(s.age);
    const height_cm =
      s.units === "metric"
        ? Number(s.heightCm)
        : inToCm(Number(s.heightFt || 0) * 12 + Number(s.heightIn || 0));
    const weight_kg = s.units === "metric" ? Number(s.weight) : lbToKg(Number(s.weight));
    const goal_weight_kg = s.units === "metric" ? Number(s.goal) : lbToKg(Number(s.goal));
    if (!age || !height_cm || !weight_kg || !goal_weight_kg) return null;
    return { age, sex: s.sex, height_cm, weight_kg, goal_weight_kg, activity: s.activity, rate: s.rate };
  }, [s]);

  const targets = useMemo(() => (metric ? computeTargets(metric) : null), [metric]);

  const canContinue = (() => {
    if (step === 0) return !!s.age && Number(s.age) > 12 && Number(s.age) < 100;
    if (step === 1)
      return (
        !!s.weight &&
        (s.units === "metric" ? !!s.heightCm : !!s.heightFt)
      );
    if (step === 3) return !!s.goal && !!metric;
    return true;
  })();

  async function finish() {
    if (!metric) return;
    setSaving(true);
    try {
      await api.saveProfile({
        name: s.name.trim() || null,
        units: s.units,
        ...metric,
      });
      router.replace("/");
    } catch (e) {
      alert((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col px-5 pt-[max(env(safe-area-inset-top),24px)] pb-8">
      {/* progress */}
      <div className="flex items-center gap-2 mb-8">
        {step > 0 ? (
          <button onClick={() => setStep((x) => x - 1)} className="text-[var(--muted)] -ml-1 pressable">
            <ChevronLeft />
          </button>
        ) : (
          <div className="w-6" />
        )}
        <div className="flex-1 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all"
              style={{ background: i <= step ? "var(--p-cal)" : "rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1" key={step}>
        {step === 0 && (
          <Step title="Let's set up your cut" sub="A few quick questions to build your plan.">
            <Labeled label="Your name (optional)">
              <input className="field" placeholder="Yashmit" value={s.name} onChange={(e) => set({ name: e.target.value })} />
            </Labeled>
            <Labeled label="Biological sex">
              <div className="seg">
                {(["male", "female"] as Sex[]).map((x) => (
                  <div key={x} className="seg-item" data-on={s.sex === x} onClick={() => set({ sex: x })}>
                    {x === "male" ? "Male" : "Female"}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--faint)] mt-1.5">Used only for the metabolic formula.</p>
            </Labeled>
            <Labeled label="Age">
              <input className="field tabular" inputMode="numeric" placeholder="20" value={s.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "") })} />
            </Labeled>
          </Step>
        )}

        {step === 1 && (
          <Step title="Your body" sub="So we can estimate your energy needs.">
            <div className="seg mb-1">
              {(["imperial", "metric"] as Units[]).map((u) => (
                <div key={u} className="seg-item" data-on={s.units === u} onClick={() => set({ units: u })}>
                  {u === "imperial" ? "lb / ft" : "kg / cm"}
                </div>
              ))}
            </div>
            <Labeled label="Height">
              {s.units === "metric" ? (
                <div className="relative">
                  <input className="field tabular pr-12" inputMode="numeric" placeholder="178" value={s.heightCm} onChange={(e) => set({ heightCm: e.target.value.replace(/\D/g, "") })} />
                  <Suffix>cm</Suffix>
                </div>
              ) : (
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input className="field tabular pr-10" inputMode="numeric" placeholder="5" value={s.heightFt} onChange={(e) => set({ heightFt: e.target.value.replace(/\D/g, "") })} />
                    <Suffix>ft</Suffix>
                  </div>
                  <div className="relative flex-1">
                    <input className="field tabular pr-10" inputMode="numeric" placeholder="10" value={s.heightIn} onChange={(e) => set({ heightIn: e.target.value.replace(/\D/g, "") })} />
                    <Suffix>in</Suffix>
                  </div>
                </div>
              )}
            </Labeled>
            <Labeled label="Current weight">
              <div className="relative">
                <input className="field tabular pr-12" inputMode="decimal" placeholder={s.units === "metric" ? "80" : "176"} value={s.weight} onChange={(e) => set({ weight: e.target.value.replace(/[^\d.]/g, "") })} />
                <Suffix>{s.units === "metric" ? "kg" : "lb"}</Suffix>
              </div>
            </Labeled>
          </Step>
        )}

        {step === 2 && (
          <Step title="How active are you?" sub="Outside of intentional dieting.">
            <div className="flex flex-col gap-2.5">
              {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((a) => (
                <Choice key={a} on={s.activity === a} onClick={() => set({ activity: a })} title={ACTIVITY_LABELS[a].title} sub={ACTIVITY_LABELS[a].sub} />
              ))}
            </div>
          </Step>
        )}

        {step === 3 && (
          <Step title="Your goal" sub="Where you want to land, and how fast.">
            <Labeled label="Goal weight">
              <div className="relative">
                <input className="field tabular pr-12" inputMode="decimal" placeholder={s.units === "metric" ? "72" : "158"} value={s.goal} onChange={(e) => set({ goal: e.target.value.replace(/[^\d.]/g, "") })} />
                <Suffix>{s.units === "metric" ? "kg" : "lb"}</Suffix>
              </div>
            </Labeled>
            <Labeled label="How aggressive?">
              <div className="flex flex-col gap-2.5">
                {(Object.keys(RATE_LABELS) as Rate[]).map((r) => (
                  <Choice key={r} on={s.rate === r} onClick={() => set({ rate: r })} title={RATE_LABELS[r].title} sub={RATE_LABELS[r].sub} />
                ))}
              </div>
            </Labeled>
          </Step>
        )}

        {step === 4 && targets && (
          <Step title="Your plan" sub="Calculated from Mifflin-St Jeor + your goal.">
            <div className="glass card p-6 text-center mb-3">
              <p className="label mb-1">Daily calorie target</p>
              <p className="text-5xl font-bold tabular">{targets.target_calories}</p>
              <p className="text-sm text-[var(--muted)] mt-1">
                {targets.deficit} kcal/day deficit · TDEE {targets.tdee}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <Macro label="Protein" v={targets.target_protein} c="var(--p-protein)" />
              <Macro label="Carbs" v={targets.target_carbs} c="var(--p-carbs)" />
              <Macro label="Fat" v={targets.target_fat} c="var(--p-fat)" />
              <Macro label="Fiber" v={targets.target_fiber} c="var(--p-fiber)" />
            </div>
            <div className="glass card p-4 flex items-center justify-around mb-3">
              <div className="text-center">
                <p className="text-xl font-bold tabular">{targets.projectedWeeklyKg.toFixed(2)} kg</p>
                <p className="text-xs text-[var(--muted)]">per week</p>
              </div>
              <div className="w-px h-8" style={{ background: "var(--line)" }} />
              <div className="text-center">
                <p className="text-xl font-bold tabular">{targets.weeksToGoal ?? "—"}</p>
                <p className="text-xs text-[var(--muted)]">weeks to goal</p>
              </div>
            </div>
            {targets.warnings.map((w, i) => (
              <div key={i} className="flex gap-2.5 p-3.5 rounded-2xl mb-2" style={{ background: "rgba(247,197,159,0.1)", border: "1px solid rgba(247,197,159,0.22)" }}>
                <span style={{ color: "var(--p-warn)" }} className="flex-shrink-0 mt-0.5">
                  <WarnIcon width={18} height={18} />
                </span>
                <p className="text-sm text-[var(--fg)]/90">{w}</p>
              </div>
            ))}
          </Step>
        )}
      </div>

      {/* action */}
      <div className="pt-4">
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary w-full" disabled={!canContinue} onClick={() => setStep((x) => x + 1)}>
            Continue
          </button>
        ) : (
          <button className="btn btn-primary w-full" disabled={saving} onClick={finish}>
            {saving ? <span className="spin w-4 h-4 border-2 border-black/30 border-t-black rounded-full" /> : <CheckIcon width={18} height={18} />}
            {saving ? "Setting up…" : "Start tracking"}
          </button>
        )}
      </div>
    </main>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rise">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-[var(--muted)] mt-1 mb-6">{sub}</p>
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Suffix({ children }: { children: React.ReactNode }) {
  return <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--faint)] pointer-events-none">{children}</span>;
}

function Choice({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className="glass card p-4 flex items-center justify-between text-left pressable"
      style={on ? { borderColor: "rgba(201,184,240,0.5)", background: "rgba(201,184,240,0.08)" } : undefined}
    >
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-[var(--muted)]">{sub}</p>
      </div>
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ border: on ? "none" : "1.5px solid var(--line)", background: on ? "var(--p-cal)" : "transparent", color: "#0a0a0a" }}
      >
        {on && <CheckIcon width={13} height={13} strokeWidth={3} />}
      </div>
    </button>
  );
}

function Macro({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="glass card py-3 flex flex-col items-center">
      <span className="text-lg font-bold tabular" style={{ color: c }}>{v}</span>
      <span className="text-[10px] text-[var(--muted)] mt-0.5">{label}</span>
    </div>
  );
}
