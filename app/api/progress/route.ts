import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, USER_ID } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DayRow {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  weight_kg: number | null;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 30));

    const nutrition = await sql<
      { date: string; calories: number; protein: number; carbs: number; fat: number; fiber: number }[]
    >`
      SELECT log_date::text AS date,
             ROUND(SUM(calories))::int AS calories,
             ROUND(SUM(protein))::int AS protein,
             ROUND(SUM(carbs))::int AS carbs,
             ROUND(SUM(fat))::int AS fat,
             ROUND(SUM(fiber))::int AS fiber
      FROM food_logs
      WHERE user_id = ${USER_ID} AND log_date >= CURRENT_DATE - ${days}::int
      GROUP BY log_date ORDER BY log_date ASC`;

    const weights = await sql<{ date: string; weight_kg: number }[]>`
      SELECT log_date::text AS date, weight_kg
      FROM weight_logs
      WHERE user_id = ${USER_ID} AND log_date >= CURRENT_DATE - ${days}::int
      ORDER BY log_date ASC`;

    const wMap = new Map(weights.map((w) => [w.date, w.weight_kg]));
    const nMap = new Map(nutrition.map((n) => [n.date, n]));

    // build a continuous date axis so charts don't skip days
    const out: DayRow[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const n = nMap.get(key);
      out.push({
        date: key,
        calories: n?.calories ?? 0,
        protein: n?.protein ?? 0,
        carbs: n?.carbs ?? 0,
        fat: n?.fat ?? 0,
        fiber: n?.fiber ?? 0,
        weight_kg: wMap.get(key) ?? null,
      });
    }

    return NextResponse.json({ days: out });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
