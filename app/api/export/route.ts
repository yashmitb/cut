import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One CSV with every food log, plus weight readings folded in by date.
// Pure download of the user's own data — no third parties.
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();

    const foods = await sql<
      {
        log_date: string; meal: string; name: string; quantity: string;
        calories: number; protein: number; carbs: number; fat: number;
        fiber: number; sugar: number; sodium: number; source: string; group_label: string | null;
      }[]
    >`
      SELECT log_date::text AS log_date, meal, name, quantity, calories, protein, carbs, fat,
             fiber, sugar, sodium, source, group_label
      FROM food_logs WHERE user_id = ${userId} ORDER BY log_date ASC, created_at ASC`;

    const weights = await sql<{ log_date: string; weight_kg: number }[]>`
      SELECT log_date::text AS log_date, weight_kg FROM weight_logs WHERE user_id = ${userId}`;
    const wMap = new Map(weights.map((w) => [w.log_date, w.weight_kg]));

    const headers = [
      "date", "meal", "food", "quantity", "calories", "protein_g", "carbs_g",
      "fat_g", "fiber_g", "sugar_g", "sodium_mg", "source", "group", "weight_kg",
    ];
    const lines = [headers.join(",")];
    for (const f of foods) {
      lines.push([
        f.log_date, f.meal, f.name, f.quantity,
        Math.round(f.calories), Math.round(f.protein), Math.round(f.carbs), Math.round(f.fat),
        Math.round(f.fiber), Math.round(f.sugar), Math.round(f.sodium),
        f.source, f.group_label ?? "", wMap.get(f.log_date) ?? "",
      ].map(csvCell).join(","));
    }
    // weight-only days (no food logged) still belong in the export
    const foodDates = new Set(foods.map((f) => f.log_date));
    for (const w of weights) {
      if (!foodDates.has(w.log_date)) {
        lines.push([w.log_date, "", "", "", "", "", "", "", "", "", "", "", "", w.weight_kg].map(csvCell).join(","));
      }
    }

    const csv = lines.join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cut-export-${stamp}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
