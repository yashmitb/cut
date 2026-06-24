import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { randomUUID } from "node:crypto";
import type { FoodLog } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEALS = new Set(["breakfast", "lunch", "dinner", "snack"]);

// Copy a previous day's food into another day. Body: { from, to, meal? }.
// Groups are preserved but re-keyed so they're independent entries on the new day.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const b = await req.json();
    const from: string = b.from;
    const to: string = b.to;
    const meal: string | null = b.meal && MEALS.has(b.meal) ? b.meal : null;
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json({ error: "Valid from/to dates required." }, { status: 400 });
    }

    const src = meal
      ? await sql<FoodLog[]>`
          SELECT * FROM food_logs WHERE user_id = ${userId} AND log_date = ${from} AND meal = ${meal} ORDER BY created_at ASC`
      : await sql<FoodLog[]>`
          SELECT * FROM food_logs WHERE user_id = ${userId} AND log_date = ${from} ORDER BY created_at ASC`;

    if (!src.length) {
      return NextResponse.json({ error: "Nothing to copy from that day.", copied: 0 }, { status: 400 });
    }

    // remap source group_ids → fresh ids so the copy is a distinct entry
    const remap = new Map<string, string>();
    for (const r of src) {
      if (r.group_id && !remap.has(r.group_id)) remap.set(r.group_id, randomUUID());
    }

    for (const r of src) {
      const gid: string | null = (r.group_id ? remap.get(r.group_id) : null) ?? null;
      await sql`
        INSERT INTO food_logs (user_id, log_date, name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium, confidence, meal, source, group_id, group_label)
        VALUES (${userId}, ${to}, ${r.name}, ${r.quantity}, ${r.calories}, ${r.protein}, ${r.carbs},
                ${r.fat}, ${r.fiber}, ${r.sugar}, ${r.sodium}, ${r.confidence ?? null}, ${r.meal}, 'quick',
                ${gid}, ${r.group_label})`;
    }

    const items = await sql<FoodLog[]>`
      SELECT id, log_date::text AS log_date, name, quantity, calories, protein, carbs, fat,
             fiber, sugar, sodium, confidence, meal, source, group_id, group_label, created_at
      FROM food_logs WHERE user_id = ${userId} AND log_date = ${to} ORDER BY created_at ASC`;
    return NextResponse.json({ items, copied: src.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
