import { NextResponse } from "next/server";
import { ensureSchema, sql, USER_ID } from "@/lib/db";
import type { FoodItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Distinct recently-logged foods for one-tap re-logging (no AI call).
export async function GET() {
  try {
    await ensureSchema();
    const rows = await sql<(FoodItem & { last: string })[]>`
      SELECT DISTINCT ON (lower(name), quantity)
             name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium,
             1.0 AS confidence, created_at AS last
      FROM food_logs
      WHERE user_id = ${USER_ID}
      ORDER BY lower(name), quantity, created_at DESC`;
    // sort by most-recent and cap
    const sorted = rows
      .sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime())
      .slice(0, 18)
      .map(({ last, ...item }) => { void last; return item; });
    return NextResponse.json({ items: sorted });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
