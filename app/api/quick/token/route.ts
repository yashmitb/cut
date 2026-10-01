import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { hashToken, newToken, validTimezone } from "@/lib/quick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { last4: string; created_at: string; last_used_at: string | null };

// Status of your quick-log link (never returns the token itself).
// ?tz= keeps the stored timezone current, so Shortcuts log to the right day/meal.
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const tz = validTimezone(req.nextUrl.searchParams.get("tz"));
    const rows = tz
      ? await sql<Row[]>`
          UPDATE quick_tokens SET timezone = ${tz} WHERE user_id = ${userId}
          RETURNING last4, created_at, last_used_at`
      : await sql<Row[]>`SELECT last4, created_at, last_used_at FROM quick_tokens WHERE user_id = ${userId}`;
    return NextResponse.json({ enabled: rows.length > 0, ...(rows[0] ?? {}) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Create or rotate the link. Rotating breaks any Shortcuts using the old one.
// Body: { timezone }. Returns the raw token exactly once.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const b = await req.json().catch(() => ({}));
    const tz = validTimezone(b.timezone) ?? "UTC";
    const token = newToken();
    await sql.begin(async (tx) => {
      await tx`DELETE FROM quick_tokens WHERE user_id = ${userId}`;
      await tx`
        INSERT INTO quick_tokens (token_hash, user_id, last4, timezone)
        VALUES (${hashToken(token)}, ${userId}, ${token.slice(-4)}, ${tz})`;
    });
    return NextResponse.json({ token, last4: token.slice(-4) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Turn quick logging off (every Shortcut using the link stops working).
export async function DELETE() {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    await sql`DELETE FROM quick_tokens WHERE user_id = ${userId}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
