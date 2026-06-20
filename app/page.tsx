"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CalorieRing from "@/components/CalorieRing";
import MacroBar from "@/components/MacroBar";
import LogItem from "@/components/LogItem";
import LogGroup from "@/components/LogGroup";
import AppLoader from "@/components/AppLoader";
import {
  AskIcon,
  BookOpen,
  CameraIcon,
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  PlusIcon,
  Search,
  SparkIcon,
  WaterIcon,
  MEAL_ICONS,
} from "@/components/Icons";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { sumTotals, relativeDay } from "@/lib/format";
import { todayLocal } from "@/lib/nutrition";
import { MEAL_META, MEAL_ORDER } from "@/lib/types";
import type { FoodLog, MealSuggestion, MealType, Profile } from "@/lib/types";

const GLASS_ML = 250;

function shiftDate(date: string, delta: number): string {
  // Build from local components and format locally — never round-trip through UTC
  // (toISOString would shift the day for positive-UTC timezones).
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

type Block =
  | { type: "single"; item: FoodLog }
  | { type: "group"; id: string; label: string; items: FoodLog[] };

// Collapse items sharing a group_id into one block, preserving order.
function buildBlocks(rows: FoodLog[]): Block[] {
  const blocks: Block[] = [];
  const idx = new Map<string, number>();
  for (const it of rows) {
    if (it.group_id) {
      const at = idx.get(it.group_id);
      if (at === undefined) {
        idx.set(it.group_id, blocks.length);
        blocks.push({ type: "group", id: it.group_id, label: it.group_label || "Group", items: [it] });
      } else {
        (blocks[at] as { type: "group"; items: FoodLog[] }).items.push(it);
      }
    } else {
      blocks.push({ type: "single", item: it });
    }
  }
  return blocks;
}

export default function TodayPage() {
  const router = useRouter();
  const today = todayLocal();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<FoodLog[]>([]);
  const [water, setWater] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadDay = useCallback(async (d: string) => {
    const [{ items }, { ml }] = await Promise.all([api.getDay(d), api.getWater(d)]);
    setItems(items);
    setWater(ml);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // single round trip for profile + today's food + water
        const { profile, items, water } = await api.getToday(today);
        if (!profile) {
          router.replace("/onboarding");
          return;
        }
        setProfile(profile);
        setItems(items);
        setWater(water);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function go(delta: number) {
    const next = shiftDate(date, delta);
    if (next > today) return;
    setDate(next);
    try {
      await loadDay(next);
    } catch (e) {
      console.error(e);
    }
  }

  async function changeWater(delta: number) {
    setWater((w) => Math.max(0, w + delta));
    try {
      const { ml } = await api.addWater(date, delta);
      setWater(ml);
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return <LoadingToday />;
  if (!profile) return null;

  const t = sumTotals(items);
  const glasses = Math.round(water / GLASS_ML);
  const isToday = date === today;
  const remaining = {
    calories: Math.max(0, profile.target_calories - t.calories),
    protein: Math.max(0, profile.target_protein - t.protein),
    carbs: Math.max(0, profile.target_carbs - t.carbs),
    fat: Math.max(0, profile.target_fat - t.fat),
    fiber: Math.max(0, profile.target_fiber - t.fiber),
    sugar: 0,
    sodium: 0,
  };

  const grouped = MEAL_ORDER.map((m) => ({
    meal: m,
    rows: items.filter((i) => i.meal === m),
  })).filter((g) => g.rows.length > 0);

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),20px)] pb-32">
      {/* date nav */}
      <header className="flex items-center justify-between mb-6 rise">
        <button onClick={() => go(-1)} className="w-10 h-10 rounded-full glass flex items-center justify-center text-[var(--muted)] pressable" aria-label="Previous day">
          <ChevronLeft width={20} height={20} />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight leading-tight">{relativeDay(date, today)}</h1>
          <p className="text-xs text-[var(--muted)]">
            {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
        <button onClick={() => go(1)} disabled={isToday} className="w-10 h-10 rounded-full glass flex items-center justify-center text-[var(--muted)] pressable disabled:opacity-30" aria-label="Next day">
          <ChevronRight width={20} height={20} />
        </button>
      </header>

      {/* Ring */}
      <section className="glass card flex flex-col items-center py-7 mb-4 pop">
        <CalorieRing consumed={t.calories} target={profile.target_calories} />
        <div className="grid grid-cols-3 gap-2 w-full px-5 mt-6">
          <MiniStat label="Eaten" value={Math.round(t.calories)} />
          <MiniStat label="Daily target" value={profile.target_calories} />
          <MiniStat label="Protein left" value={Math.round(remaining.protein)} accent="var(--p-protein)" suffix="g" />
        </div>
      </section>

      {/* Macros */}
      <section className="glass card p-5 mb-3 rise rise-2 flex flex-col gap-4">
        <MacroBar label="Protein" value={t.protein} target={profile.target_protein} color="var(--p-protein)" />
        <MacroBar label="Carbs" value={t.carbs} target={profile.target_carbs} color="var(--p-carbs)" />
        <MacroBar label="Fat" value={t.fat} target={profile.target_fat} color="var(--p-fat)" />
        <MacroBar label="Fiber" value={t.fiber} target={profile.target_fiber} color="var(--p-fiber)" />
      </section>

      {/* AI coach suggestion */}
      <button
        onClick={() => setSheetOpen(true)}
        className="glass card w-full p-3.5 mb-3 flex items-center gap-3 rise rise-2 pressable drift"
        style={{ backgroundImage: "linear-gradient(120deg, rgba(201,184,240,0.12), rgba(168,208,240,0.05), rgba(201,184,240,0.12))" }}
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(201,184,240,0.18)", color: "var(--p-cal)" }}>
          <SparkIcon width={18} height={18} />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold">What should I eat?</p>
          <p className="text-xs text-[var(--muted)]">AI picks a meal for your {Math.round(remaining.calories)} kcal left</p>
        </div>
      </button>

      {/* Ask the coach */}
      <Link href="/ask" className="glass card w-full p-3.5 mb-3 flex items-center gap-3 rise rise-2 pressable">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(168,208,240,0.16)", color: "var(--p-carbs)" }}>
          <AskIcon width={18} height={18} />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold">Ask the coach</p>
          <p className="text-xs text-[var(--muted)]">“Which is better, X or Y?” · food advice, anytime</p>
        </div>
      </Link>

      {/* Water */}
      <section className="glass card p-4 mb-4 rise rise-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(169,228,236,0.14)", color: "var(--p-water)" }}>
            <WaterIcon width={20} height={20} />
          </div>
          <div>
            <p className="text-sm font-semibold">Water</p>
            <p className="text-xs text-[var(--muted)] tabular">{(water / 1000).toFixed(2)} L · {glasses} glasses</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeWater(-GLASS_ML)} className="w-9 h-9 rounded-full btn-ghost flex items-center justify-center text-lg pressable" aria-label="Remove a glass">−</button>
          <button onClick={() => changeWater(GLASS_ML)} className="w-9 h-9 rounded-full flex items-center justify-center pressable text-lg font-bold" style={{ background: "var(--p-water)", color: "#072a2e" }} aria-label="Add a glass">+</button>
        </div>
      </section>

      {/* Food list by meal */}
      <section className="rise rise-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">Logged · {items.length}</h2>
          <Link href={`/add?date=${date}`} className="text-xs font-semibold flex items-center gap-1 text-[var(--muted)] pressable">
            <PlusIcon width={14} height={14} /> Add
          </Link>
        </div>

        {items.length === 0 ? (
          <Link href={`/add?date=${date}`} className="glass card flex flex-col items-center justify-center py-10 px-6 text-center pressable">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(201,184,240,0.14)", color: "var(--p-cal)" }}>
              <CameraIcon width={26} height={26} />
            </div>
            <p className="font-semibold">{isToday ? "Snap your first meal" : "Nothing logged this day"}</p>
            <p className="text-sm text-[var(--muted)] mt-1">Tap to photograph food or describe it — AI logs the macros.</p>
          </Link>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map(({ meal, rows }, gi) => {
              const mt = sumTotals(rows);
              const MealIcon = MEAL_ICONS[meal];
              return (
                <div key={meal} className="rise" style={{ animationDelay: `${0.05 * gi}s` }}>
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <MealIcon width={15} height={15} className="text-[var(--muted)]" /> {MEAL_META[meal].label}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--muted)] tabular">{Math.round(mt.calories)} kcal</span>
                      <Link href={`/add?date=${date}&meal=${meal}`} className="text-[var(--faint)] hover:text-[var(--fg)] pressable" aria-label={`Add to ${meal}`}>
                        <PlusIcon width={15} height={15} />
                      </Link>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {buildBlocks(rows).map((blk) =>
                      blk.type === "group" ? (
                        <LogGroup key={blk.id} id={blk.id} label={blk.label} items={blk.items} date={date} meal={meal} onChanged={setItems} />
                      ) : (
                        <LogItem key={blk.item.id} item={blk.item} date={date} onChanged={setItems} />
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {sheetOpen && (
        <SuggestSheet
          remaining={remaining}
          date={date}
          onLogged={() => loadDay(date)}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </main>
  );
}

const CRAVINGS = ["High protein", "Something sweet", "Quick & easy", "Low calorie", "Comfort food", "Surprise me"];

function SuggestSheet({
  remaining,
  date,
  onLogged,
  onClose,
}: {
  remaining: ReturnType<typeof sumTotals>;
  date: string;
  onLogged: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"ask" | "loading" | "result">("ask");
  const [craving, setCraving] = useState("");
  const [suggestion, setSuggestion] = useState<MealSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const [closing, setClosing] = useState(false);

  // animate the sheet out before unmounting
  const requestClose = () => {
    setClosing(true);
    setTimeout(onClose, 260);
  };

  async function ask(c: string) {
    setError(null);
    setPhase("loading");
    try {
      const { suggestion } = await api.suggest(remaining, mealNow(), c === "Surprise me" ? "" : c);
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
        date,
        [{ name: suggestion.dish, quantity: "1 serving", calories: suggestion.calories, protein: suggestion.protein, carbs: suggestion.carbs, fat: suggestion.fat, fiber: suggestion.fiber, sugar: 0, sodium: 0, confidence: 0.8 }],
        "manual",
        mealNow()
      );
      setLogged(true);
      onLogged();
      setTimeout(requestClose, 650);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={requestClose}>
      <div className={`absolute inset-0 ${closing ? "fade-out" : "fade-in"}`} style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }} />
      <div
        className={`glass-strong relative w-full max-w-md rounded-t-[32px] p-6 pb-[max(env(safe-area-inset-bottom),24px)] ${closing ? "sheet-down" : "sheet-up"} flex flex-col`}
        style={{ maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-5 flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }} />
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <span style={{ color: "var(--p-cal)" }}><SparkIcon width={20} height={20} /></span>
          <h3 className="text-lg font-bold">What should I eat?</h3>
        </div>
        <div className="flex gap-1.5 mb-4 flex-wrap flex-shrink-0">
          <Pill label={`${Math.round(remaining.calories)} kcal left`} c="var(--p-cal)" />
          <Pill label={`${Math.round(remaining.protein)}g protein`} c="var(--p-protein)" />
        </div>

        <div className="overflow-y-auto -mx-1 px-1">
          {phase === "ask" && (
            <div className="rise">
              <p className="text-sm text-[var(--muted)] mb-3">What are you in the mood for? Tap one and I&apos;ll build a recipe that fits what&apos;s left.</p>
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
            <div className="flex items-center gap-3 py-10 justify-center text-[var(--muted)]">
              <span className="spin w-5 h-5 rounded-full" style={{ border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "var(--p-cal)" }} />
              Cooking up an idea…
            </div>
          )}

          {phase === "result" && suggestion && (
            <div className="rise">
              <h4 className="text-xl font-bold tracking-tight">{suggestion.dish}</h4>
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
                className="btn btn-ghost w-full mb-2"
              >
                <Search width={16} height={16} /> Find recipes online
              </a>
            </div>
          )}
        </div>

        {/* footer actions */}
        <div className="flex-shrink-0 pt-3">
          {phase === "result" ? (
            <div className="flex gap-2">
              <button onClick={() => setPhase("ask")} className="btn btn-ghost flex-1">
                <BookOpen width={16} height={16} /> Another
              </button>
              <button onClick={logIt} className="btn btn-primary flex-1" style={logged ? { background: "var(--p-fiber)" } : undefined}>
                {logged ? <><CheckIcon width={16} height={16} /> Logged</> : <><PlusIcon width={16} height={16} /> Log it</>}
              </button>
            </div>
          ) : (
            <button onClick={requestClose} className="btn btn-ghost w-full">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

function mealNow(): MealType {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

function Pill({ label, c }: { label: string; c: string }) {
  return (
    <span className="chip tabular" style={{ color: c, borderColor: `${c}44`, background: `${c}11` }}>{label}</span>
  );
}

function MiniStat({ label, value, accent, suffix }: { label: string; value: number; accent?: string; suffix?: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-lg font-bold tabular" style={accent ? { color: accent } : undefined}>{value}{suffix}</span>
      <span className="text-[11px] text-[var(--muted)] leading-tight mt-0.5">{label}</span>
    </div>
  );
}

function LoadingToday() {
  return (
    <main className="px-4 pb-32">
      <AppLoader label="Loading your day…" />
    </main>
  );
}
