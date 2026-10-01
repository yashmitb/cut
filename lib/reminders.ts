// Reminder rules shared by the cron (server), the app-icon badge, and the
// Reminders UI (client). Pure — no web-push / DB imports, safe in the browser.
import type { MealType } from "./types";

export const MAIN_MEALS: MealType[] = ["breakfast", "lunch", "dinner"];

export const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

/** "HH:MM" → minutes since midnight, or null if malformed. */
export function parseHHMM(s: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  const min = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return min >= 0 && min < 1440 ? min : null;
}

/**
 * Main meals whose reminder time has already passed today but have nothing
 * logged — what the badge counts and the evening check-in mentions.
 */
export function missingMeals(
  times: Partial<Record<string, string>>,
  logged: Set<string>,
  nowMinutes: number
): MealType[] {
  return MAIN_MEALS.filter((m) => {
    const t = parseHHMM(times[m]);
    return t != null && t <= nowMinutes && !logged.has(m);
  });
}

/** "Dinner" / "Lunch & dinner" / "Breakfast, lunch & dinner" */
export function listMeals(meals: MealType[]): string {
  const names = meals.map((m, i) => (i === 0 ? MEAL_LABEL[m] : MEAL_LABEL[m].toLowerCase()));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** Consecutive logged days ending today (or yesterday, if today isn't logged yet). */
export function loggingStreak(loggedDates: Set<string>, today: string): number {
  const step = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10);
  };
  let d = loggedDates.has(today) ? today : step(today);
  let n = 0;
  while (loggedDates.has(d)) {
    n++;
    d = step(d);
  }
  return n;
}

/** Median of minute-of-day samples, then nudged later and rounded to 5 min. */
export function suggestTime(samples: number[], offsetMin = 20): string | null {
  if (samples.length < 3) return null;
  const s = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  const t = Math.min(23 * 60 + 55, Math.round((median + offsetMin) / 5) * 5);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
