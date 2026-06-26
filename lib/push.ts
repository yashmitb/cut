import webpush from "web-push";
import { sql } from "./db";

// ---------------------------------------------------------------------------
// Web Push plumbing. VAPID keys + the cron secret are generated once and stored
// in the DB (server_keys), so there are zero env vars to configure.
// ---------------------------------------------------------------------------

export interface ServerKeys {
  vapid_public: string;
  vapid_private: string;
  cron_secret: string;
}

let configured = false;

export async function getServerKeys(): Promise<ServerKeys> {
  const rows = await sql<ServerKeys[]>`SELECT vapid_public, vapid_private, cron_secret FROM server_keys WHERE id = 'global'`;
  if (rows[0]) return rows[0];
  const vapid = webpush.generateVAPIDKeys();
  const cron_secret = cryptoRandom(32);
  await sql`
    INSERT INTO server_keys (id, vapid_public, vapid_private, cron_secret)
    VALUES ('global', ${vapid.publicKey}, ${vapid.privateKey}, ${cron_secret})
    ON CONFLICT (id) DO NOTHING`;
  const again = await sql<ServerKeys[]>`SELECT vapid_public, vapid_private, cron_secret FROM server_keys WHERE id = 'global'`;
  return again[0];
}

function cryptoRandom(bytes: number): string {
  // base64url, URL-safe so it can live in a cron query string
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Buffer.from(arr).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function ensureWebPushConfigured(): Promise<ServerKeys> {
  const keys = await getServerKeys();
  if (!configured) {
    webpush.setVapidDetails("mailto:reminders@cut.app", keys.vapid_public, keys.vapid_private);
    configured = true;
  }
  return keys;
}

// ---- reminder schedule ----

export type ReminderKey = "weight" | "breakfast" | "lunch" | "dinner";
export interface ReminderConfig {
  enabled: boolean;
  times: Partial<Record<ReminderKey, string>>; // "HH:MM"
}

export const REMINDER_COPY: Record<ReminderKey, string> = {
  weight: "Step on the scale and log today's weight ⚖️",
  breakfast: "Log your breakfast 🍳",
  lunch: "Lunch time — don't forget to log it 🥗",
  dinner: "Log dinner to close out your day 🍽️",
};

// fire within this many minutes after the scheduled time (tolerates cron delays
// and stops a freshly-enabled reminder from firing for times earlier in the day)
export const DUE_WINDOW_MIN = 90;

/** The user's local calendar date + minutes-since-midnight, DST-correct. */
export function localNow(now: Date, timezone: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some engines emit 24 at midnight
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + parseInt(get("minute"), 10) };
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  const min = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return min >= 0 && min < 1440 ? min : null;
}

/**
 * Which reminders are due right now for one subscription — pure + testable.
 * A reminder is due when the local time is within [scheduled, scheduled+window]
 * and it hasn't already been sent on the local date.
 */
export function dueReminders(
  reminders: ReminderConfig,
  lastSent: Partial<Record<ReminderKey, string>>,
  timezone: string,
  now: Date
): ReminderKey[] {
  if (!reminders?.enabled || !reminders.times) return [];
  const { date, minutes } = localNow(now, timezone);
  const out: ReminderKey[] = [];
  for (const key of Object.keys(reminders.times) as ReminderKey[]) {
    const sched = parseHHMM(reminders.times[key] || "");
    if (sched == null) continue;
    const delta = minutes - sched;
    if (delta >= 0 && delta <= DUE_WINDOW_MIN && lastSent[key] !== date) out.push(key);
  }
  return out;
}

export interface StoredSub {
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
  reminders: ReminderConfig;
  last_sent: Partial<Record<ReminderKey, string>>;
}

/** Send one push; returns false (and signals caller to prune) on 404/410. */
export async function sendPush(sub: StoredSub, title: string, body: string): Promise<{ ok: boolean; gone: boolean }> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title, body })
    );
    return { ok: true, gone: false };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return { ok: false, gone: status === 404 || status === 410 };
  }
}
