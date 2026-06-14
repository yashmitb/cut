import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, USER_ID } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const date = req.nextUrl.searchParams.get("date") || "";
    if (!DATE_RE.test(date)) return NextResponse.json({ error: "date required." }, { status: 400 });
    const rows = await sql<{ ml: number }[]>`
      SELECT ml FROM water_logs WHERE user_id = ${USER_ID} AND log_date = ${date}`;
    return NextResponse.json({ ml: rows[0]?.ml ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    const date: string = b.date;
    const delta = Number(b.delta || 0);
    if (!DATE_RE.test(date)) return NextResponse.json({ error: "date required." }, { status: 400 });
    const rows = await sql<{ ml: number }[]>`
      INSERT INTO water_logs (user_id, log_date, ml)
      VALUES (${USER_ID}, ${date}, GREATEST(0, ${delta}))
      ON CONFLICT (user_id, log_date)
      DO UPDATE SET ml = GREATEST(0, water_logs.ml + ${delta})
      RETURNING ml`;
    return NextResponse.json({ ml: rows[0]?.ml ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
