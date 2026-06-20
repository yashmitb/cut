"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { displayWeight, shortDate } from "@/lib/format";
import { Flame, Sprout } from "@/components/Icons";
import AppLoader from "@/components/AppLoader";
import type { Profile, Units } from "@/lib/types";
import type { DayRow } from "@/app/api/progress/route";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function ProgressPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DayRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ days: rows }, { profile }] = await Promise.all([api.getProgress(days), api.getProfile()]);
        setData(rows);
        setProfile(profile);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  const units: Units = profile?.units ?? "imperial";

  const stats = useMemo(() => {
    const logged = data.filter((d) => d.calories > 0);
    const avgCal = logged.length ? Math.round(logged.reduce((a, d) => a + d.calories, 0) / logged.length) : 0;
    const avgProtein = logged.length ? Math.round(logged.reduce((a, d) => a + d.protein, 0) / logged.length) : 0;
    const target = profile?.target_calories ?? 0;
    const onTarget = target ? logged.filter((d) => d.calories <= target * 1.05).length : 0;
    const adherence = logged.length ? Math.round((onTarget / logged.length) * 100) : 0;
    const weights = data.filter((d) => d.weight_kg != null);
    const weightChange =
      weights.length >= 2 ? (weights[weights.length - 1].weight_kg! - weights[0].weight_kg!) : 0;

    // logging streak: consecutive logged days ending at the most recent one
    // (don't break it just because today isn't logged yet)
    let streak = 0;
    let i = data.length - 1;
    if (i >= 0 && data[i].calories === 0) i--;
    for (; i >= 0; i--) {
      if (data[i].calories > 0) streak++;
      else break;
    }
    return { avgCal, avgProtein, adherence, weightChange, loggedDays: logged.length, streak };
  }, [data, profile]);

  const maxCal = Math.max(profile?.target_calories ?? 0, ...data.map((d) => d.calories), 100) * 1.12;
  const maxProtein = Math.max(profile?.target_protein ?? 0, ...data.map((d) => d.protein), 50) * 1.12;
  const maxFiber = Math.max(profile?.target_fiber ?? 0, ...data.map((d) => d.fiber), 20) * 1.12;

  const chartData = data.map((d) => ({
    ...d,
    label: shortDate(d.date),
    weightDisp: d.weight_kg != null ? displayWeight(d.weight_kg, units).value : null,
  }));

  const wChange = displayWeight(Math.abs(stats.weightChange), units);

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),20px)] pb-32">
      <header className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <div className="seg !w-auto">
          {RANGES.map((r) => (
            <div key={r.days} className="seg-item !px-3" data-on={days === r.days} onClick={() => setDays(r.days)}>
              {r.label}
            </div>
          ))}
        </div>
      </header>

      {loading ? (
        <AppLoader label="Crunching your numbers…" />
      ) : (
        <>
      {/* streak banner */}
      <div className="glass card p-4 mb-3 flex items-center gap-3.5 rise" style={{ background: "linear-gradient(120deg, rgba(247,197,159,0.12), rgba(246,166,184,0.05))" }}>
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${stats.streak > 0 ? "halo" : ""}`} style={{ background: stats.streak > 0 ? "rgba(247,197,159,0.16)" : "rgba(181,232,201,0.14)", color: stats.streak > 0 ? "var(--p-warn)" : "var(--p-fiber)" }}>
          {stats.streak > 0 ? <Flame width={22} height={22} /> : <Sprout width={22} height={22} />}
        </span>
        <div>
          <p className="text-2xl font-bold tabular leading-none">{stats.streak} day{stats.streak === 1 ? "" : "s"}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{stats.streak > 0 ? "logging streak — keep it going" : "log a meal to start your streak"}</p>
        </div>
      </div>

      {/* summary stats */}
      <div className="grid grid-cols-2 gap-3 mb-4 rise rise-1">
        <StatCard label="Avg calories" value={stats.avgCal.toString()} sub={profile ? `target ${profile.target_calories}` : ""} color="var(--p-cal)" />
        <StatCard label="Avg protein" value={`${stats.avgProtein}g`} sub={profile ? `target ${profile.target_protein}g` : ""} color="var(--p-protein)" />
        <StatCard
          label="Weight change"
          value={`${stats.weightChange <= 0 ? "−" : "+"}${wChange.value} ${wChange.unit}`}
          sub={`over ${days} days`}
          color={stats.weightChange <= 0 ? "var(--p-fiber)" : "var(--p-warn)"}
        />
        <StatCard label="On-target days" value={`${stats.adherence}%`} sub={`${stats.loggedDays} logged`} color="var(--p-carbs)" />
      </div>

        <div className="flex flex-col gap-4 rise rise-2">
          {/* Calories */}
          <ChartCard title="Calories per day" accent="var(--p-cal)">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 6, right: 4, left: -6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={46} domain={[0, Math.round(maxCal)]} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<GlassTip unit="kcal" />} />
                {profile && <ReferenceLine y={profile.target_calories} stroke="rgba(201,184,240,0.5)" strokeDasharray="4 4" />}
                <Bar dataKey="calories" fill="var(--p-cal)" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Protein */}
          <ChartCard title="Protein per day" accent="var(--p-protein)">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={chartData} margin={{ top: 6, right: 4, left: -6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={46} domain={[0, Math.round(maxProtein)]} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<GlassTip unit="g" />} />
                {profile && <ReferenceLine y={profile.target_protein} stroke="rgba(246,166,184,0.5)" strokeDasharray="4 4" />}
                <Bar dataKey="protein" fill="var(--p-protein)" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Weight */}
          <ChartCard title={`Weight trend (${units === "imperial" ? "lb" : "kg"})`} accent="var(--p-fiber)">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={46} domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip content={<GlassTip unit={units === "imperial" ? "lb" : "kg"} keyName="weightDisp" />} />
                <Line type="monotone" dataKey="weightDisp" stroke="var(--p-fiber)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--p-fiber)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Fiber */}
          <ChartCard title="Fiber per day" accent="var(--p-fiber)">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} margin={{ top: 6, right: 4, left: -6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={46} domain={[0, Math.round(maxFiber)]} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<GlassTip unit="g" />} />
                {profile && <ReferenceLine y={profile.target_fiber} stroke="rgba(181,232,201,0.5)" strokeDasharray="4 4" />}
                <Bar dataKey="fiber" fill="var(--p-fiber)" radius={[5, 5, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        </>
      )}
    </main>
  );
}

const axisTick = { fill: "var(--faint)", fontSize: 11 };

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="glass card p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-2xl font-bold tabular mt-1" style={{ color }}>{value}</p>
      <p className="text-[11px] text-[var(--faint)] mt-0.5">{sub}</p>
    </div>
  );
}

function ChartCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="glass card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

interface TipProps {
  active?: boolean;
  payload?: { value: number; payload: { label: string } }[];
  unit?: string;
  keyName?: string;
}
function GlassTip({ active, payload, unit }: TipProps) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  if (v == null) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      <p className="text-[var(--muted)]">{payload[0].payload.label}</p>
      <p className="font-bold tabular">{Math.round(Number(v))} {unit}</p>
    </div>
  );
}
