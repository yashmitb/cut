import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import type { FoodItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Combo = { group_label: string; calories: number; items: FoodItem[] };

// One-tap re-logging — fully deterministic, no AI.
//  • Items: your individually-logged foods, deduped by name, newest first.
//    Stale one-offs (logged once, >10 days ago) are dropped so the list stays
//    fresh and free of random noise.
//  • Combos: meal groups you've saved before (≥2 items), deduped by their
//    contents so the same combination shows once. Tap to re-log the whole thing.
export async function GET() {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();

    // --- recent individual items, recency-ranked, stale randoms removed ---
    const items = await sql<(FoodItem & { count: number })[]>`
      WITH recent AS (
        SELECT name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium,
               COUNT(*)     OVER (PARTITION BY lower(name)) AS count,
               MAX(created_at) OVER (PARTITION BY lower(name)) AS last_at,
               ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at DESC) AS rn
        FROM food_logs
        WHERE user_id = ${userId}
          AND created_at > now() - interval '30 days'
      )
      SELECT name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium,
             1.0 AS confidence, count::int AS count
      FROM recent
      WHERE rn = 1
        AND (count >= 2 OR last_at > now() - interval '10 days')
      ORDER BY last_at DESC
      LIMIT 24`;

    // --- saved combos: pick one representative group per distinct content ---
    const reps = await sql<{ group_id: string; group_label: string | null }[]>`
      WITH groups AS (
        SELECT group_id,
               MAX(group_label) AS group_label,
               MAX(created_at)  AS last_at,
               string_agg(DISTINCT lower(name), '|' ORDER BY lower(name)) AS sig
        FROM food_logs
        WHERE user_id = ${userId}
          AND group_id IS NOT NULL
          AND created_at > now() - interval '60 days'
        GROUP BY group_id
        HAVING COUNT(*) >= 2
      ),
      dedup AS (
        SELECT group_id, group_label, last_at,
               ROW_NUMBER() OVER (PARTITION BY sig ORDER BY last_at DESC) AS rn
        FROM groups
      )
      SELECT group_id, group_label
      FROM dedup
      WHERE rn = 1
      ORDER BY last_at DESC
      LIMIT 8`;

    let combos: Combo[] = [];
    if (reps.length) {
      const ids = reps.map((r) => r.group_id);
      const rows = await sql<(FoodItem & { group_id: string })[]>`
        SELECT group_id, name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium,
               1.0 AS confidence
        FROM food_logs
        WHERE user_id = ${userId} AND group_id = ANY(${ids})
        ORDER BY id ASC`;
      const byGroup = new Map<string, FoodItem[]>();
      for (const r of rows) {
        const { group_id, ...item } = r;
        if (!byGroup.has(group_id)) byGroup.set(group_id, []);
        byGroup.get(group_id)!.push(item);
      }
      combos = reps
        .map((rep) => {
          const its = byGroup.get(rep.group_id) || [];
          const calories = its.reduce((s, i) => s + (i.calories || 0), 0);
          const label = rep.group_label?.trim() || its.map((i) => i.name).slice(0, 3).join(" + ");
          return { group_label: label, calories, items: its };
        })
        .filter((c) => c.items.length >= 2);
    }

    return NextResponse.json({ items, combos });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
