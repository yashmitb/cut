"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import CalorieRing from "@/components/CalorieRing";
import MacroBar from "@/components/MacroBar";
import LogItem from "@/components/LogItem";
import LogGroup from "@/components/LogGroup";
import AppLoader from "@/components/AppLoader";
import {
  AskIcon,
  CameraIcon,
  ChevronLeft,
  ChevronRight,
  PlusIcon,
  SparkIcon,
  MEAL_ICONS,
} from "@/components/Icons";
import { api } from "@/lib/api";
import { sumTotals, relativeDay } from "@/lib/format";
import { todayLocal } from "@/lib/nutrition";
import { MEAL_META, MEAL_ORDER } from "@/lib/types";
import type { FoodLog, Profile } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  return (
    <Suspense fallback={<LoadingToday />}>
      <TodayInner />
    </Suspense>
  );
}

function TodayInner() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayLocal();
  // deep-link to a past day via ?date= (used when returning from Add on a past day)
  const qd = params.get("date");
  const initialDate = qd && DATE_RE.test(qd) && qd <= today ? qd : today;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [date, setDate] = useState(initialDate);
  const [items, setItems] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDay = useCallback(async (d: string) => {
    const { items } = await api.getDay(d);
    setItems(items);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // single round trip for profile + the day's food
        const { profile, items } = await api.getToday(initialDate);
        if (!profile) {
          router.replace("/onboarding");
          return;
        }
        setProfile(profile);
        setItems(items);
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

  if (loading) return <LoadingToday />;
  if (!profile) return null;

  const t = sumTotals(items);
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
      <Link
        href="/eat"
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
      </Link>

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

    </main>
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
    // solid background so the ambient glow doesn't make the empty screen look two-tone
    <main className="min-h-dvh flex items-center justify-center px-4 pb-24" style={{ background: "var(--bg)" }}>
      <AppLoader full={false} label="Loading your day…" />
    </main>
  );
}
