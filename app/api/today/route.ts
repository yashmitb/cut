import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import type { FoodLog, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Combined initial-load endpoint: profile + day's food + water in ONE request
// (one auth check, one DB connection) instead of three round trips.
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const date = req.nextUrl.searchParams.get("date");
    if (!date || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Valid ?date=YYYY-MM-DD required." }, { status: 400 });
    }

    const [profileRows, items, waterRows] = await Promise.all([
      sql<Profile[]>`SELECT * FROM profile WHERE id = ${userId}`,
      sql<FoodLog[]>`
        SELECT id, log_date::text AS log_date, name, quantity, calories, protein, carbs, fat,
               fiber, sugar, sodium, confidence, meal, source, group_id, group_label, created_at
        FROM food_logs WHERE user_id = ${userId} AND log_date = ${date} ORDER BY created_at ASC`,
      sql<{ ml: number }[]>`SELECT ml FROM water_logs WHERE user_id = ${userId} AND log_date = ${date}`,
    ]);

    return NextResponse.json({
      profile: profileRows[0] ?? null,
      items,
      water: waterRows[0]?.ml ?? 0,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
