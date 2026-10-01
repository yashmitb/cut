import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { suggestTime } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validTz(tz: string | null): string | null {
  if (!tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

// Suggest reminder times from when you actually log each meal (last 30 days).
// Uses the first same-day log per meal per day, takes the median, and adds
// 20 min — reminders skip anything already logged, so this only fires on days
// you'd otherwise forget. Back-filled entries (logged on a later day) are ignored.
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const tz = validTz(req.nextUrl.searchParams.get("tz"));
    if (!tz) return NextResponse.json({ error: "Valid ?tz= required." }, { status: 400 });

    const meals = await sql<{ meal: string; m: number }[]>`
      SELECT meal,
             MIN(EXTRACT(HOUR FROM created_at AT TIME ZONE ${tz}) * 60
               + EXTRACT(MINUTE FROM created_at AT TIME ZONE ${tz}))::int AS m
      FROM food_logs
      WHERE user_id = ${userId}
        AND created_at > now() - interval '30 days'
        AND (created_at AT TIME ZONE ${tz})::date = log_date
      GROUP BY log_date, meal`;

    const weights = await sql<{ m: number }[]>`
      SELECT (EXTRACT(HOUR FROM created_at AT TIME ZONE ${tz}) * 60
            + EXTRACT(MINUTE FROM created_at AT TIME ZONE ${tz}))::int AS m
      FROM weight_logs
      WHERE user_id = ${userId}
        AND created_at > now() - interval '30 days'
        AND (created_at AT TIME ZONE ${tz})::date = log_date`;

    const samples: Record<string, number[]> = { breakfast: [], lunch: [], dinner: [], weight: weights.map((w) => w.m) };
    for (const r of meals) samples[r.meal]?.push(r.m);

    const times: Record<string, string> = {};
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(samples)) {
      counts[k] = v.length;
      const t = suggestTime(v, k === "weight" ? 0 : 20);
      if (t) times[k] = t;
    }
    return NextResponse.json({ times, counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
