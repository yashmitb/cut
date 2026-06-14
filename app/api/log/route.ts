import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql, USER_ID } from "@/lib/db";
import type { FoodItem, FoodLog } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function fetchDay(date: string) {
  const rows = await sql<FoodLog[]>`
    SELECT id, log_date::text AS log_date, name, quantity, calories, protein, carbs, fat,
           fiber, sugar, sodium, confidence, meal, source, created_at
    FROM food_logs
    WHERE user_id = ${USER_ID} AND log_date = ${date}
    ORDER BY created_at ASC`;
  return rows;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const date = req.nextUrl.searchParams.get("date");
    if (!date || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Valid ?date=YYYY-MM-DD required." }, { status: 400 });
    }
    return NextResponse.json({ items: await fetchDay(date) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    const date: string = b.date;
    const items: FoodItem[] = b.items || [];
    const source: string = b.source || "manual";
    const meal: string = b.meal || "snack";
    if (!date || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Valid date required." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: "No items to add." }, { status: 400 });
    }
    for (const it of items) {
      await sql`
        INSERT INTO food_logs (user_id, log_date, name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium, confidence, meal, source)
        VALUES (${USER_ID}, ${date}, ${it.name}, ${it.quantity || ""}, ${it.calories || 0},
                ${it.protein || 0}, ${it.carbs || 0}, ${it.fat || 0}, ${it.fiber || 0},
                ${it.sugar || 0}, ${it.sodium || 0}, ${it.confidence ?? null}, ${meal}, ${source})`;
    }
    return NextResponse.json({ items: await fetchDay(date) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSchema();
    const b = await req.json();
    const id = Number(b.id);
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    await sql`
      UPDATE food_logs SET
        name = ${b.name}, quantity = ${b.quantity || ""},
        calories = ${b.calories || 0}, protein = ${b.protein || 0}, carbs = ${b.carbs || 0},
        fat = ${b.fat || 0}, fiber = ${b.fiber || 0}, sugar = ${b.sugar || 0}, sodium = ${b.sodium || 0},
        meal = COALESCE(${b.meal ?? null}, meal)
      WHERE id = ${id} AND user_id = ${USER_ID}`;
    const row = await sql<FoodLog[]>`SELECT log_date::text AS log_date FROM food_logs WHERE id = ${id}`;
    return NextResponse.json({ items: row[0] ? await fetchDay(row[0].log_date) : [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureSchema();
    const id = Number(req.nextUrl.searchParams.get("id"));
    const date = req.nextUrl.searchParams.get("date") || "";
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    await sql`DELETE FROM food_logs WHERE id = ${id} AND user_id = ${USER_ID}`;
    return NextResponse.json({ items: DATE_RE.test(date) ? await fetchDay(date) : [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
