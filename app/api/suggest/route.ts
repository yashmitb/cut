import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { suggestMeal } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const b = await req.json();
    const remaining = {
      calories: Math.round(Number(b.calories) || 0),
      protein: Math.round(Number(b.protein) || 0),
      carbs: Math.round(Number(b.carbs) || 0),
      fat: Math.round(Number(b.fat) || 0),
      fiber: Math.round(Number(b.fiber) || 0),
    };
    const meal: string = b.meal || "meal";
    const craving: string = typeof b.craving === "string" ? b.craving.slice(0, 200) : "";

    const favs = await sql<{ name: string }[]>`
      SELECT name, COUNT(*) AS c FROM food_logs WHERE user_id = ${userId}
      GROUP BY name ORDER BY c DESC LIMIT 10`;

    const suggestion = await suggestMeal({ userId, remaining, meal, craving, recentFavorites: favs.map((f) => f.name) });
    return NextResponse.json({ suggestion });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
