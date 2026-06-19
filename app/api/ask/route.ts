import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { askCoach, aiErrorPayload, type ChatTurn } from "@/lib/gemini";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const b = await req.json();
    const message: string = (b.message || "").trim();
    const history: ChatTurn[] = b.history || [];
    const date: string = DATE_RE.test(b.date) ? b.date : "";
    if (!message) return NextResponse.json({ error: "Empty message." }, { status: 400 });

    // Build the user's context so answers are personalized.
    const profileRows = await sql<Profile[]>`SELECT * FROM profile WHERE id = ${userId}`;
    const p = profileRows[0];

    let context = "No profile set up yet.";
    if (p) {
      const items = date
        ? await sql<{ name: string; quantity: string; calories: number; protein: number }[]>`
            SELECT name, quantity, calories, protein FROM food_logs
            WHERE user_id = ${userId} AND log_date = ${date} ORDER BY created_at ASC`
        : [];
      const eaten = items.reduce(
        (a, i) => ({ cal: a.cal + (i.calories || 0), pro: a.pro + (i.protein || 0) }),
        { cal: 0, pro: 0 }
      );
      const foods = items.length
        ? items.map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ""} ~${Math.round(i.calories)}kcal/${Math.round(i.protein)}gP`).join("; ")
        : "nothing logged yet";
      context =
        `Goal: cutting (lose fat, keep muscle). Daily targets: ${p.target_calories} kcal, ` +
        `${p.target_protein}g protein, ${p.target_carbs}g carbs, ${p.target_fat}g fat, ${p.target_fiber}g fiber. ` +
        `Eaten so far today: ${Math.round(eaten.cal)} kcal, ${Math.round(eaten.pro)}g protein — ` +
        `${Math.max(0, p.target_calories - Math.round(eaten.cal))} kcal and ${Math.max(0, p.target_protein - Math.round(eaten.pro))}g protein left. ` +
        `Today's foods: ${foods}.`;
    }

    const text = await askCoach({ userId, message, history, context });
    return NextResponse.json({ text });
  } catch (e) {
    const { status, body } = aiErrorPayload(e);
    return NextResponse.json(body, { status });
  }
}
