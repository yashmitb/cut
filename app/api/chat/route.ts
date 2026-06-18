import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { converse, aiErrorPayload, type ChatTurn } from "@/lib/gemini";
import type { FoodItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function recentCorrections(userId: string): Promise<string[]> {
  const rows = await sql<{ note: string }[]>`
    SELECT note FROM corrections WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 15`;
  return rows.map((r) => r.note);
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const b = await req.json();
    const message: string = (b.message || "").trim();
    const currentItems: FoodItem[] = b.currentItems || [];
    const history: ChatTurn[] = b.history || [];
    if (!message) return NextResponse.json({ error: "Empty message." }, { status: 400 });

    const corrections = await recentCorrections(userId);
    const result = await converse({ userId, message, currentItems, history, corrections });

    // Learning: a message that refines an existing analysis is genuine feedback.
    // Persist it so future analyses apply the same correction.
    if (currentItems.length > 0) {
      const food = currentItems[0]?.name || "meal";
      await sql`INSERT INTO corrections (user_id, food, note) VALUES (${userId}, ${food}, ${message.slice(0, 280)})`;
    }

    return NextResponse.json(result);
  } catch (e) {
    const { status, body } = aiErrorPayload(e);
    return NextResponse.json(body, { status });
  }
}
