import { NextRequest } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { userForToken } from "@/lib/quick";
import { localNow } from "@/lib/push";
import { converse } from "@/lib/gemini";
import { lbToKg } from "@/lib/nutrition";
import { MEAL_META, MEAL_ORDER, mealForHour, type FoodItem, type MealType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Log from outside the app — iOS Shortcuts (Home Screen widget, Lock Screen /
// Control Center, Action Button, Back Tap, Siri) or any URL launcher. Auth is
// the personal token from Profile → "Log from your Home Screen".
//
// Params (query string, or JSON body on POST):
//   t=TOKEN                      required (or Authorization: Bearer TOKEN)
//   food=Whey shake [&x=1.5]     re-log a starred/recent food, optional portion
//   say=2 eggs and toast         describe it — AI parses and logs it
//   weight=182 [&unit=lb|kg]     log today's weight
//   list=1                       your starred + recent foods, one per line
//   status=1                     what's left today
//   meal=breakfast|lunch|dinner|snack   override the time-of-day meal
//
// Replies are short plain text, made for Shortcuts' "Show Notification".

type Params = Record<string, string | undefined>;

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

async function remaining(userId: string, date: string): Promise<string> {
  const [prof, tot] = await Promise.all([
    sql<{ target_calories: number; target_protein: number }[]>`
      SELECT target_calories, target_protein FROM profile WHERE id = ${userId}`,
    sql<{ cal: number; pro: number; n: number }[]>`
      SELECT COALESCE(SUM(calories), 0)::float AS cal, COALESCE(SUM(protein), 0)::float AS pro, COUNT(*)::int AS n
      FROM food_logs WHERE user_id = ${userId} AND log_date = ${date}`,
  ]);
  const p = prof[0];
  const t = tot[0];
  if (!p) return `${fmt(t.cal)} kcal today`;
  const cal = p.target_calories - t.cal;
  const pro = Math.max(0, p.target_protein - t.pro);
  return cal >= 0
    ? `${fmt(cal)} kcal · ${fmt(pro)} g protein left`
    : `${fmt(-cal)} kcal over · ${fmt(pro)} g protein left`;
}

const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

// Starred first, then exact recent match, then partial matches.
async function findFood(userId: string, q: string): Promise<FoodItem | null> {
  const key = q.trim().toLowerCase();
  const like = `%${escLike(key)}%`;
  const cols = sql`name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium`;
  const tries = [
    sql<FoodItem[]>`SELECT ${cols} FROM favorites WHERE user_id = ${userId} AND name_key = ${key} LIMIT 1`,
    sql<FoodItem[]>`SELECT ${cols} FROM food_logs WHERE user_id = ${userId} AND lower(name) = ${key}
                    ORDER BY created_at DESC LIMIT 1`,
    sql<FoodItem[]>`SELECT ${cols} FROM favorites WHERE user_id = ${userId} AND name_key LIKE ${like}
                    ORDER BY length(name_key) ASC LIMIT 1`,
    sql<FoodItem[]>`SELECT ${cols} FROM food_logs WHERE user_id = ${userId} AND lower(name) LIKE ${like}
                    ORDER BY created_at DESC LIMIT 1`,
  ];
  for (const t of tries) {
    const rows = await t;
    if (rows[0]) return rows[0];
  }
  return null;
}

async function insertItems(userId: string, date: string, meal: MealType, items: FoodItem[], source: string) {
  await sql.begin(async (tx) => {
    for (const it of items) {
      await tx`
        INSERT INTO food_logs (user_id, log_date, name, quantity, calories, protein, carbs, fat, fiber, sugar, sodium, confidence, meal, source)
        VALUES (${userId}, ${date}, ${it.name}, ${it.quantity || ""}, ${it.calories || 0}, ${it.protein || 0},
                ${it.carbs || 0}, ${it.fat || 0}, ${it.fiber || 0}, ${it.sugar || 0}, ${it.sodium || 0},
                ${it.confidence ?? null}, ${meal}, ${source})`;
    }
  });
}

function scale(it: FoodItem, x: number): FoodItem {
  if (x === 1) return it;
  const r = (n: number) => Math.round((n || 0) * x);
  return {
    ...it,
    calories: r(it.calories), protein: r(it.protein), carbs: r(it.carbs), fat: r(it.fat),
    fiber: r(it.fiber), sugar: r(it.sugar), sodium: r(it.sodium),
    quantity: `${x}× ${it.quantity?.trim() || "serving"}`,
  };
}

async function handle(req: NextRequest, p: Params): Promise<Response> {
  await ensureSchema();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const auth = await userForToken(p.t || bearer || "");
  if (!auth) return text("Quick-log link isn't valid. Make a new one in Cut → Profile → Log from your Home Screen.", 401);
  const userId = auth.user_id;

  const { date, minutes } = localNow(new Date(), auth.timezone);
  const meal: MealType =
    p.meal && MEAL_ORDER.includes(p.meal as MealType) ? (p.meal as MealType) : mealForHour(Math.floor(minutes / 60));

  if (p.list) {
    const favs = await sql<{ name: string }[]>`
      SELECT name FROM favorites WHERE user_id = ${userId} ORDER BY created_at DESC`;
    const recent = await sql<{ name: string }[]>`
      SELECT name FROM (
        SELECT DISTINCT ON (lower(name)) name, created_at FROM food_logs
        WHERE user_id = ${userId} AND created_at > now() - interval '14 days'
        ORDER BY lower(name), created_at DESC
      ) r ORDER BY created_at DESC LIMIT 12`;
    const seen = new Set<string>();
    const names = [...favs, ...recent]
      .map((r) => r.name)
      .filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
    if (!names.length) return text("No foods yet — log something in Cut first, then star your go-tos.", 404);
    return text(names.join("\n"));
  }

  if (p.status) return text(await remaining(userId, date));

  if (p.weight) {
    const v = parseFloat(p.weight.replace(",", ".")); // Shortcuts' Number input is locale-formatted
    const prof = await sql<{ units: string }[]>`SELECT units FROM profile WHERE id = ${userId}`;
    const unit = p.unit === "kg" || p.unit === "lb" ? p.unit : prof[0]?.units === "metric" ? "kg" : "lb";
    const kg = unit === "kg" ? v : lbToKg(v);
    if (!isFinite(kg) || kg < 20 || kg > 350) return text(`"${p.weight}" doesn't look like a weight in ${unit}.`, 400);
    await sql`
      INSERT INTO weight_logs (user_id, log_date, weight_kg) VALUES (${userId}, ${date}, ${kg})
      ON CONFLICT (user_id, log_date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg`;
    await sql`
      UPDATE profile SET weight_kg = ${kg}, updated_at = now()
      WHERE id = ${userId} AND ${date} = (SELECT MAX(log_date)::text FROM weight_logs WHERE user_id = ${userId})`;
    return text(`✓ Weight logged: ${Math.round(v * 10) / 10} ${unit}`);
  }

  if (p.say) {
    const message = p.say.trim().slice(0, 500);
    if (!message) return text("Say what you ate, e.g. “2 eggs and toast”.", 400);
    const res = await converse({ userId, message });
    if (!res.items.length) return text(`Couldn't find food in “${message}”. Try again with amounts.`, 422);
    await insertItems(userId, date, meal, res.items, "chat");
    const kcal = res.items.reduce((a, i) => a + i.calories, 0);
    const what = res.items.length === 1 ? res.items[0].name : `${res.items.length} items`;
    const check = res.needs_clarification ? " (AI wasn't sure — check it in Cut)" : "";
    return text(`✓ ${what}, ${fmt(kcal)} kcal → ${MEAL_META[meal].label}${check}\n${await remaining(userId, date)}`);
  }

  if (p.food) {
    const found = await findFood(userId, p.food);
    if (!found) return text(`Couldn't find “${p.food}”. Log it once in Cut (and star it) first.`, 404);
    const x = p.x ? parseFloat(p.x) : 1;
    if (!isFinite(x) || x <= 0 || x > 10) return text(`Portion “${p.x}” should be between 0 and 10.`, 400);
    const item = scale({ ...found, confidence: 1 }, x);
    await insertItems(userId, date, meal, [item], "quick");
    return text(`✓ ${item.name}${x !== 1 ? ` ×${x}` : ""}, ${fmt(item.calories)} kcal → ${MEAL_META[meal].label}\n${await remaining(userId, date)}`);
  }

  return text("Nothing to do. Add food=…, say=…, weight=…, list=1 or status=1.", 400);
}

function fail(e: unknown): Response {
  const code = (e as { code?: string })?.code;
  if (code === "RATE_LIMIT") return text("Cut AI is out of free requests for now — use Log Food, or try again later.", 429);
  if (code === "NO_KEY") return text("No Gemini key linked — add one in Cut → Profile → AI connection.", 400);
  console.error("[quick]", e);
  return text("Something went wrong — try again.", 500);
}

export async function GET(req: NextRequest) {
  try {
    return await handle(req, Object.fromEntries(req.nextUrl.searchParams));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const p: Params = Object.fromEntries(req.nextUrl.searchParams);
    for (const [k, v] of Object.entries(body ?? {})) if (v != null) p[k] = String(v);
    return await handle(req, p);
  } catch (e) {
    return fail(e);
  }
}
