import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import {
  ensureWebPushConfigured,
  dueReminders,
  sendPush,
  REMINDER_COPY,
  type ReminderConfig,
  type ReminderKey,
  type StoredSub,
} from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = StoredSub & { last_sent: Partial<Record<ReminderKey, string>> };

// Called on a schedule by a free external cron (GitHub Actions, cron-job.org…).
// Auth is the per-install secret in ?key=. Sends any reminders that are due and
// records them so each fires once per day.
async function run(req: NextRequest) {
  await ensureSchema();
  const keys = await ensureWebPushConfigured();
  const provided = req.nextUrl.searchParams.get("key") || req.headers.get("x-cron-key");
  if (!provided || provided !== keys.cron_secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subs = await sql<Row[]>`
    SELECT endpoint, p256dh, auth, timezone, reminders, last_sent FROM push_subs`;

  const now = new Date();
  let sent = 0;
  let pruned = 0;

  for (const sub of subs) {
    const reminders = (sub.reminders || { enabled: false, times: {} }) as ReminderConfig;
    const lastSent = sub.last_sent || {};
    const due = dueReminders(reminders, lastSent, sub.timezone, now);
    if (!due.length) continue;

    const { date } = localDate(now, sub.timezone);
    let gone = false;
    for (const key of due) {
      const res = await sendPush(sub, "Cut", REMINDER_COPY[key]);
      if (res.ok) {
        lastSent[key] = date;
        sent++;
      } else if (res.gone) {
        gone = true;
        break;
      }
    }
    if (gone) {
      await sql`DELETE FROM push_subs WHERE endpoint = ${sub.endpoint}`;
      pruned++;
    } else {
      await sql`UPDATE push_subs SET last_sent = ${sql.json(lastSent)} WHERE endpoint = ${sub.endpoint}`;
    }
  }

  return NextResponse.json({ ok: true, subs: subs.length, sent, pruned });
}

function localDate(now: Date, timezone: string): { date: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return { date: `${g("year")}-${g("month")}-${g("day")}` };
  } catch {
    return { date: now.toISOString().slice(0, 10) };
  }
}

export async function GET(req: NextRequest) {
  try {
    return await run(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await run(req);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
