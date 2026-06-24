"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { sumTotals } from "@/lib/format";
import { todayLocal } from "@/lib/nutrition";
import AppLoader from "@/components/AppLoader";
import { BookOpen, CheckIcon, ChevronLeft, PlusIcon, Search, SparkIcon, Target } from "@/components/Icons";
import type { MealType, MealSuggestion } from "@/lib/types";

const CRAVINGS = ["High protein", "Something sweet", "Quick & easy", "Low calorie", "Comfort food", "Surprise me"];

function mealNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

export default function EatPage() {
  const router = useRouter();
  const today = todayLocal();

  const [remaining, setRemaining] = useState<ReturnType<typeof sumTotals> | null>(null);
  const [phase, setPhase] = useState<"ask" | "loading" | "result">("ask");
  const [craving, setCraving] = useState("");
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { profile, items } = await api.getToday(today);
        if (!profile) { router.replace("/onboarding"); return; }
        const t = sumTotals(items);
        setRemaining({
          calories: Math.max(0, profile.target_calories - t.calories),
          protein: Math.max(0, profile.target_protein - t.protein),
          carbs: Math.max(0, profile.target_carbs - t.carbs),
          fat: Math.max(0, profile.target_fat - t.fat),
          fiber: Math.max(0, profile.target_fiber - t.fiber),
          sugar: 0,
          sodium: 0,
        });
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // adjustable calorie budget for this meal — macros scale proportionally
  const baseCal = remaining ? Math.max(0, Math.round(remaining.calories)) : 0;
  const [budget, setBudget] = useState<number | null>(null);
  useEffect(() => {
    if (remaining && budget === null) setBudget(baseCal > 0 ? baseCal : 400);
  }, [remaining, baseCal, budget]);

  if (!remaining || budget === null) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4 pb-24" style={{ background: "var(--bg)" }}>
        <AppLoader full={false} label="Loading…" />
      </main>
    );
  }

  const factor = baseCal > 0 ? budget / baseCal : 1;
  const scaled = {
    calories: budget,
    protein: Math.round(remaining.protein * factor),
    carbs: Math.round(remaining.carbs * factor),
    fat: Math.round(remaining.fat * factor),
    fiber: Math.round(remaining.fiber * factor),
    sugar: 0,
    sodium: 0,
  };

  async function ask(c: string) {
    setError(null);
    setPhase("loading");
    try {
      const { suggestion } = await api.suggest(scaled, mealNow(), c === "Surprise me" ? "" : c);
      setSuggestion(suggestion);
      setPhase("result");
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
      setPhase("ask");
    }
  }

  // "Make it fit" — a meal engineered to land on the exact remaining macros.
  async function askFit() {
    if (!remaining) return;
    setError(null);
    setPhase("loading");
    try {
      const precise = {
        calories: baseCal,
        protein: Math.round(remaining.protein), carbs: Math.round(remaining.carbs),
        fat: Math.round(remaining.fat), fiber: Math.round(remaining.fiber), sugar: 0, sodium: 0,
      };
      const hint = `Build a meal that lands as precisely as possible on the user's exact remaining macros for the day: ${precise.protein}g protein, ${precise.carbs}g carbs, ${precise.fat}g fat, about ${baseCal} kcal. Prioritise matching protein and total calories.`;
      const { suggestion } = await api.suggest(precise, mealNow(), hint);
      setSuggestion(suggestion);
      setPhase("result");
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
      setPhase("ask");
    }
  }

  async function logIt() {
    if (!suggestion) return;
    try {
      await api.addItems(
        today,
        [{ name: suggestion.dish, quantity: "1 serving", calories: suggestion.calories, protein: suggestion.protein, carbs: suggestion.carbs, fat: suggestion.fat, fiber: suggestion.fiber, sugar: 0, sodium: 0, confidence: 0.8 }],
        "manual",
        mealNow()
      );
      setLogged(true);
      setTimeout(() => router.push("/"), 700);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    }
  }

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),20px)] pb-32 max-w-md mx-auto">
      {/* header */}
      <header className="flex items-center gap-3 mb-6 rise">
        <button onClick={() => router.back()} className="w-10 h-10 rounded-full glass flex items-center justify-center text-[var(--muted)] pressable" aria-label="Back">
          <ChevronLeft width={20} height={20} />
        </button>
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--p-cal)" }}><SparkIcon width={22} height={22} /></span>
          <h1 className="text-xl font-bold tracking-tight">What should I eat?</h1>
        </div>
      </header>

      {/* adjustable budget (ask phase only) */}
      {phase === "ask" && (
        <div className="glass card p-3.5 mb-4 rise rise-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="label !text-[10px]">This meal&apos;s budget</p>
              <p className="text-xs text-[var(--muted)] mt-1 tabular">
                ≈ <span style={{ color: "var(--p-protein)" }}>{scaled.protein}g P</span> · {scaled.carbs}g C · {scaled.fat}g F
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setBudget((b) => Math.max(50, (b ?? baseCal) - 50))} className="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-lg pressable" aria-label="Less">−</button>
              <div className="text-center w-[58px]">
                <span className="text-xl font-bold tabular leading-none">{budget}</span>
                <span className="text-[10px] text-[var(--muted)] block">kcal</span>
              </div>
              <button onClick={() => setBudget((b) => Math.min(2000, (b ?? baseCal) + 50))} className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold pressable" style={{ background: "var(--p-cal)", color: "#0a0a0a" }} aria-label="More">+</button>
            </div>
          </div>
          {baseCal > 0 && budget !== baseCal && (
            <button onClick={() => setBudget(baseCal)} className="text-[11px] text-[var(--muted)] underline mt-2 pressable">
              Use all {baseCal} kcal left today
            </button>
          )}
        </div>
      )}

      {phase === "ask" && baseCal > 0 && (
        <button
          onClick={askFit}
          className="glass card w-full p-3.5 mb-4 flex items-center gap-3 rise rise-2 pressable drift text-left"
          style={{ backgroundImage: "linear-gradient(120deg, rgba(181,232,201,0.14), rgba(168,208,240,0.05), rgba(181,232,201,0.14))" }}
        >
          <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(181,232,201,0.2)", color: "var(--p-fiber)" }}>
            <Target width={18} height={18} />
          </span>
          <span>
            <span className="block text-sm font-semibold">Make it fit</span>
            <span className="block text-xs text-[var(--muted)]">A meal engineered to land on your exact remaining macros</span>
          </span>
        </button>
      )}

      {phase === "ask" && (
        <div className="rise rise-3">
          <p className="text-sm text-[var(--muted)] mb-3">What are you in the mood for? Tap one and I&apos;ll build a recipe for that budget.</p>
          <div className="flex flex-wrap gap-2">
            {CRAVINGS.map((c) => (
              <button key={c} onClick={() => { setCraving(c === "Surprise me" ? "" : c); ask(c); }} className="chip pressable !py-2 !px-3.5" style={{ color: "var(--fg)" }}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
            <span className="text-[11px] text-[var(--faint)] uppercase tracking-wider">or type your own</span>
            <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
          </div>
          <div className="flex gap-2">
            <input
              className="field"
              placeholder="e.g. something with chicken…"
              value={craving}
              onChange={(e) => setCraving(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && craving.trim() && ask(craving)}
            />
            <button onClick={() => ask(craving)} disabled={!craving.trim()} className="btn btn-primary !px-4 flex-shrink-0" aria-label="Get a recipe">
              <SparkIcon width={18} height={18} />
            </button>
          </div>
          {error && <p className="text-sm mt-3" style={{ color: "var(--p-warn)" }}>{error}</p>}
        </div>
      )}

      {phase === "loading" && (
        <div className="flex items-center gap-3 py-20 justify-center text-[var(--muted)]">
          <span className="spin w-5 h-5 rounded-full" style={{ border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "var(--p-cal)" }} />
          Cooking up an idea…
        </div>
      )}

      {phase === "result" && suggestion && (
        <div className="rise">
          <h2 className="text-2xl font-bold tracking-tight">{suggestion.dish}</h2>
          {suggestion.blurb && <p className="text-sm text-[var(--muted)] mt-1 mb-3">{suggestion.blurb}</p>}
          <div className="flex gap-1.5 flex-wrap mb-4">
            <Pill label={`${suggestion.calories} kcal`} c="var(--p-cal)" />
            <Pill label={`${suggestion.protein}g protein`} c="var(--p-protein)" />
            <Pill label={`${suggestion.carbs}g carbs`} c="var(--p-carbs)" />
            <Pill label={`${suggestion.fat}g fat`} c="var(--p-fat)" />
          </div>

          {suggestion.ingredients.length > 0 && (
            <div className="mb-4">
              <p className="label !text-[11px] mb-2">Ingredients</p>
              <ul className="flex flex-col gap-1.5">
                {suggestion.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-[var(--p-cal)]">•</span>
                    <span>{ing}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {suggestion.steps.length > 0 && (
            <div className="mb-4">
              <p className="label !text-[11px] mb-2">Steps</p>
              <ol className="flex flex-col gap-2">
                {suggestion.steps.map((s, i) => (
                  <li key={i} className="text-sm flex gap-2.5">
                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold" style={{ background: "rgba(201,184,240,0.16)", color: "var(--p-cal)" }}>{i + 1}</span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(suggestion.dish + " recipe")}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost w-full mb-3"
          >
            <Search width={16} height={16} /> Find recipes online
          </a>

          <div className="flex gap-2">
            <button onClick={() => setPhase("ask")} className="btn btn-ghost flex-1">
              <BookOpen width={16} height={16} /> Another
            </button>
            <button onClick={logIt} className="btn btn-primary flex-1" style={logged ? { background: "var(--p-fiber)" } : undefined}>
              {logged ? <><CheckIcon width={16} height={16} /> Logged</> : <><PlusIcon width={16} height={16} /> Log it</>}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Pill({ label, c }: { label: string; c: string }) {
  return (
    <span className="chip tabular" style={{ color: c, borderColor: `${c}44`, background: `${c}11` }}>{label}</span>
  );
}
