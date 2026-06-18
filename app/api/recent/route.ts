import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import type { FoodItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-tap re-logging (no AI). Collapses portion variants of the same food into a
// single entry (most-recent version), ranked by how often it's eaten.
export async function GET() {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const rows = await sql<(FoodItem & { count: number })[]>`
      WITH ranked AS (
        SELECT name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium, created_at,
               COUNT(*)    OVER (PARTITION BY lower(name)) AS count,
               ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at DESC) AS rn
        FROM food_logs
        WHERE user_id = ${userId}
      )
      SELECT name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium,
             1.0 AS confidence, count::int AS count
      FROM ranked
      WHERE rn = 1
      ORDER BY count DESC, lower(name) ASC
      LIMIT 20`;
    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
