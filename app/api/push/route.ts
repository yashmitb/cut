import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getUserId, getUser, unauthorized } from "@/lib/supabase/auth";
import { SUPABASE_CONFIGURED } from "@/lib/supabase/env";
import { ensureWebPushConfigured, type ReminderConfig } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the app owner gets the cron-secret setup panel — other users just get
// reminders working with no setup of their own.
const OWNER_EMAIL = "yashmitb07@gmail.com";

async function isOwner(): Promise<boolean> {
  if (!SUPABASE_CONFIGURED) return true; // local dev, single-user
  const user = await getUser();
  return (user?.email || "").toLowerCase() === OWNER_EMAIL;
}

// Setup info for the client: the VAPID public key to subscribe with, plus
// (owner only) the cron secret + URL pasted into a free scheduler (GitHub Actions etc.).
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const userId = await getUserId();
    if (!userId) return unauthorized();
    const keys = await ensureWebPushConfigured();
    const subs = await sql<{ endpoint: string }[]>`SELECT endpoint FROM push_subs WHERE user_id = ${userId}`;
    const owner = await isOwner();
    const origin = req.nextUrl.origin;
    return NextResponse.json({
      vapidPublicKey: keys.vapid_public,
      cronSecret: owner ? keys.cron_secret : null,
      cronUrl: owner ? `${origin}/api/cron/reminders?key=${keys.cron_secret}` : null,
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

    // "test via real cron": the client sets reminders.times.test to right now.
    // Clear any stale last_sent.test so it's eligible again, then the next
    // real cron tick (cron-job.org / GitHub Actions) sends it through the
    // exact same /api/cron/reminders path a real reminder uses.
    if (b.cronTest) {
      await sql`UPDATE push_subs SET last_sent = last_sent - 'test' WHERE endpoint = ${endpoint}`;
      return NextResponse.json({ ok: true, cronTest: true });
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
