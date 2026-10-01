import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import {
  ensureWebPushConfigured,
  dueReminders,
  localNow,
  sendPush,
  REMINDER_COPY,
  type PushMessage,
  type ReminderConfig,
  type ReminderKey,
  type StoredSub,
} from "@/lib/push";
import { listMeals, loggingStreak, missingMeals } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = StoredSub & { user_id: string; last_sent: Partial<Record<ReminderKey, string>> };

interface DayState {
  logged: Set<string>; // meals with anything logged today
  itemCount: number;
  kcalLeft: number | null;
  weighed: boolean;
  streak: number;
}

// What the user has already done today — reminders only nudge about what's missing.
async function dayState(userId: string, date: string): Promise<DayState> {
  const [items, weights, prof, days] = await Promise.all([
    sql<{ meal: string; calories: number }[]>`
      SELECT meal, calories FROM food_logs WHERE user_id = ${userId} AND log_date = ${date}`,
    sql`SELECT 1 FROM weight_logs WHERE user_id = ${userId} AND log_date = ${date}`,
    sql<{ target_calories: number }[]>`SELECT target_calories FROM profile WHERE id = ${userId}`,
    sql<{ d: string }[]>`
      SELECT DISTINCT log_date::text AS d FROM food_logs
      WHERE user_id = ${userId} AND log_date > ${date}::date - 120 AND log_date <= ${date}::date`,
  ]);
  const eaten = items.reduce((a, i) => a + (i.calories || 0), 0);
  return {
    logged: new Set(items.map((i) => i.meal)),
    itemCount: items.length,
    kcalLeft: prof[0] ? Math.max(0, Math.round(prof[0].target_calories - eaten)) : null,
    weighed: weights.length > 0,
    streak: loggingStreak(new Set(days.map((r) => r.d)), date),
  };
}

/** The message for one due reminder, or null to skip it (already done). */
function compose(
  key: ReminderKey,
  st: DayState,
  times: ReminderConfig["times"],
  minutes: number,
  origin: string
): Omit<PushMessage, "badge"> | null {
  const url = (path: string) => `${origin}${path}`;
  if (key === "test") return { title: "Cut", body: REMINDER_COPY.test, navigate: url("/") };
  if (key === "weight") {
    if (st.weighed) return null;
    return { title: "Cut", body: REMINDER_COPY.weight, navigate: url("/profile#weight") };
  }
  if (key === "recap") {
    if (st.itemCount === 0) {
      return { title: "Cut", body: "Nothing logged today yet — add what you ate before bed.", navigate: url("/add") };
    }
    const missing = missingMeals(times, st.logged, minutes);
    if (!missing.length) return null;
    const left = st.kcalLeft != null ? ` · ${st.kcalLeft.toLocaleString("en-US")} kcal left` : "";
    return {
      title: "Cut",
      body: `${listMeals(missing)} not logged yet${left}`,
      navigate: url(missing.length === 1 ? `/add?meal=${missing[0]}` : "/"),
    };
  }
  // a meal reminder
  if (st.logged.has(key)) return null;
  const streak = st.streak >= 2 ? ` · 🔥 ${st.streak}-day streak` : "";
  return { title: "Cut", body: `${REMINDER_COPY[key]}${streak}`, navigate: url(`/add?meal=${key}`) };
}

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
    SELECT endpoint, user_id, p256dh, auth, timezone, reminders, last_sent FROM push_subs`;

  const now = new Date();
  const origin = req.nextUrl.origin;
  const states = new Map<string, Promise<DayState>>();
  let sent = 0;
  let skipped = 0;
  let pruned = 0;

  for (const sub of subs) {
    const reminders = (sub.reminders || { enabled: false, times: {} }) as ReminderConfig;
    const lastSent = sub.last_sent || {};
    const due = dueReminders(reminders, lastSent, sub.timezone, now);
    if (!due.length) continue;

    const { date, minutes } = localNow(now, sub.timezone);
    const cacheKey = `${sub.user_id}|${date}`;
    if (!states.has(cacheKey)) states.set(cacheKey, dayState(sub.user_id, date));
    const st = await states.get(cacheKey)!;
    // badge = main meals whose time has passed with nothing logged
    const badge = missingMeals(reminders.times, st.logged, minutes).length;

    let gone = false;
    for (const key of due) {
      const msg = compose(key, st, reminders.times, minutes, origin);
      if (!msg) {
        // already done today — mark it so it doesn't fire later in the window
        lastSent[key] = date;
        skipped++;
        continue;
      }
      const res = await sendPush(sub, { ...msg, badge });
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
    } else if (lastSent.test === date && reminders.times.test) {
      // "test" is one-shot: drop it once sent so it doesn't repeat daily.
      // Delete just that key in SQL so a concurrent schedule edit isn't clobbered.
      await sql`
        UPDATE push_subs SET last_sent = ${sql.json(lastSent)}, reminders = reminders #- '{times,test}'
        WHERE endpoint = ${sub.endpoint}`;
    } else {
      await sql`UPDATE push_subs SET last_sent = ${sql.json(lastSent)} WHERE endpoint = ${sub.endpoint}`;
    }
  }

  return NextResponse.json({ ok: true, subs: subs.length, sent, skipped, pruned });
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
