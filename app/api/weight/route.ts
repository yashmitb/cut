import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import type { WeightLog } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const rows = await sql<WeightLog[]>`
      SELECT id, log_date::text AS log_date, weight_kg, created_at
      FROM weight_logs WHERE user_id = ${userId} ORDER BY log_date ASC`;
    return NextResponse.json({ weights: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const b = await req.json();
    const date: string = b.date;
    const weight = Number(b.weight_kg);
    if (!DATE_RE.test(date) || !weight) {
      return NextResponse.json({ error: "date and weight_kg required." }, { status: 400 });
    }
    await sql`
      INSERT INTO weight_logs (user_id, log_date, weight_kg)
      VALUES (${userId}, ${date}, ${weight})
      ON CONFLICT (user_id, log_date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg`;
    // keep the profile's current weight in sync with the latest entry
    await sql`
      UPDATE profile SET weight_kg = ${weight}, updated_at = now()
      WHERE id = ${userId}
        AND ${date} = (SELECT MAX(log_date)::text FROM weight_logs WHERE user_id = ${userId})`;
    const rows = await sql<WeightLog[]>`
      SELECT id, log_date::text AS log_date, weight_kg, created_at
      FROM weight_logs WHERE user_id = ${userId} ORDER BY log_date ASC`;
    return NextResponse.json({ weights: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
