import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { geminiStatus, testApiKey } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Status only — never returns the full key.
export async function GET() {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    return NextResponse.json(await geminiStatus(userId));
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

    // Test the currently-linked key/model without changing anything.
    if (b.action === "test") {
      return NextResponse.json(await testApiKey(userId));
    }

    // Save / update / clear the key and optional model override.
    const rawKey = typeof b.gemini_api_key === "string" ? b.gemini_api_key.trim() : undefined;
    const rawModel = typeof b.gemini_model === "string" ? b.gemini_model.trim() : undefined;

    // empty string clears; undefined leaves it untouched
    const keyVal = rawKey === undefined ? undefined : rawKey === "" ? null : rawKey;
    const modelVal = rawModel === undefined ? undefined : rawModel === "" ? null : rawModel;

    await sql`
      INSERT INTO app_settings (id, gemini_api_key, gemini_model, updated_at)
      VALUES (${userId}, ${keyVal ?? null}, ${modelVal ?? null}, now())
      ON CONFLICT (id) DO UPDATE SET
        gemini_api_key = ${keyVal === undefined ? sql`app_settings.gemini_api_key` : keyVal},
        gemini_model   = ${modelVal === undefined ? sql`app_settings.gemini_model` : modelVal},
        updated_at = now()`;

    return NextResponse.json(await geminiStatus(userId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
