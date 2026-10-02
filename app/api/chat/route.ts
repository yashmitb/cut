import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { recentCorrections, saveCorrection } from "@/lib/corrections";
import { converse, aiErrorPayload, type ChatTurn } from "@/lib/gemini";
import type { FoodItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const { learned, ...result } = await converse({ userId, message, currentItems, history, corrections });

    // Learning: only keep a reusable rule the model extracted from a real
    // correction ("user's usual rice portion is 1 cup") — not every chat line,
    // which used to fill future prompts with noise like "add a banana".
    if (learned) await saveCorrection(userId, currentItems[0]?.name || "meal", learned);

    return NextResponse.json(result);
  } catch (e) {
    const { status, body } = aiErrorPayload(e);
    return NextResponse.json(body, { status });
  }
}
