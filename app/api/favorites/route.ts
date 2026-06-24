import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import type { Favorite } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function list(userId: string): Promise<Favorite[]> {
  return sql<Favorite[]>`
    SELECT name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium
    FROM favorites WHERE user_id = ${userId} ORDER BY created_at DESC`;
}

export async function GET() {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    return NextResponse.json({ favorites: await list(userId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Toggle a favorite. Body: { item: FoodItem, on?: boolean }.
// If `on` is omitted, flips current state. Keyed case-insensitively by name.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const b = await req.json();
    const it = b.item || {};
    const name = String(it.name || "").trim();
    if (!name) return NextResponse.json({ error: "item.name required." }, { status: 400 });
    const key = name.toLowerCase();

    const existing = await sql<{ name_key: string }[]>`
      SELECT name_key FROM favorites WHERE user_id = ${userId} AND name_key = ${key}`;
    const turnOn = b.on === undefined ? existing.length === 0 : !!b.on;

    if (turnOn) {
      await sql`
        INSERT INTO favorites (user_id, name_key, name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium)
        VALUES (${userId}, ${key}, ${name}, ${it.quantity || ""}, ${it.calories || 0}, ${it.protein || 0},
                ${it.carbs || 0}, ${it.fat || 0}, ${it.fiber || 0}, ${it.sugar || 0}, ${it.sodium || 0})
        ON CONFLICT (user_id, name_key) DO UPDATE SET
          quantity = EXCLUDED.quantity, calories = EXCLUDED.calories, protein = EXCLUDED.protein,
          carbs = EXCLUDED.carbs, fat = EXCLUDED.fat, fiber = EXCLUDED.fiber,
          sugar = EXCLUDED.sugar, sodium = EXCLUDED.sodium`;
    } else {
      await sql`DELETE FROM favorites WHERE user_id = ${userId} AND name_key = ${key}`;
    }

    return NextResponse.json({ favorites: await list(userId), on: turnOn });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
