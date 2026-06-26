import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, unauthorized } from "@/lib/supabase/auth";
import { ensureWebPushConfigured, sendPush, type ReminderConfig } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Setup info for the client: the VAPID public key to subscribe with, plus the
// cron secret + URL the user pastes into a free scheduler (GitHub Actions etc.).
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const keys = await ensureWebPushConfigured();
    const subs = await sql<{ endpoint: string }[]>`SELECT endpoint FROM push_subs WHERE user_id = ${userId}`;
    const origin = req.nextUrl.origin;
    return NextResponse.json({
      vapidPublicKey: keys.vapid_public,
      cronSecret: keys.cron_secret,
      cronUrl: `${origin}/api/cron/reminders?key=${keys.cron_secret}`,
      subscriptions: subs.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Subscribe / update this device's schedule.
// Body: { subscription: PushSubscriptionJSON, reminders: ReminderConfig, timezone }
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    await ensureWebPushConfigured();
    const b = await req.json();
    const subJson = b.subscription;
    const endpoint: string = subJson?.endpoint;
    const p256dh: string = subJson?.keys?.p256dh;
    const auth: string = subJson?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Valid subscription required." }, { status: 400 });
    }
    const reminders: ReminderConfig = b.reminders || { enabled: false, times: {} };
    const timezone: string = typeof b.timezone === "string" ? b.timezone.slice(0, 64) : "UTC";

    await sql`
      INSERT INTO push_subs (endpoint, user_id, p256dh, auth, timezone, reminders, last_sent, updated_at)
      VALUES (${endpoint}, ${userId}, ${p256dh}, ${auth}, ${timezone}, ${sql.json(reminders as never)}, '{}'::jsonb, now())
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        timezone = EXCLUDED.timezone, reminders = EXCLUDED.reminders, updated_at = now()`;

    // optional end-to-end test: send a push to this device right now
    if (b.test) {
      const res = await sendPush({ endpoint, p256dh, auth, timezone, reminders, last_sent: {} }, "Cut", "Reminders are on — you'll get nudges even when the app is closed. ✅");
      return NextResponse.json({ ok: res.ok, test: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Remove this device's subscription (when the user turns reminders off).
export async function DELETE(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const endpoint = req.nextUrl.searchParams.get("endpoint");
    if (endpoint) {
      await sql`DELETE FROM push_subs WHERE user_id = ${userId} AND endpoint = ${endpoint}`;
    } else {
      await sql`DELETE FROM push_subs WHERE user_id = ${userId}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
