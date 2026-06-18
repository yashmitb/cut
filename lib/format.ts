import type { FoodItem, FoodLog, DayTotals, Units } from "./types";
import { cmToIn, kgToLb } from "./nutrition";

/** Pull a leading number (incl. simple fractions like "1/2") off a quantity string. */
export function parseLeadingNumber(s: string): { num: number | null; unit: string } {
  const m = (s || "").trim().match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*(.*)$/);
  if (!m) return { num: null, unit: (s || "").trim() };
  const a = parseFloat(m[1]);
  const b = m[2] ? parseFloat(m[2]) : null;
  const num = b ? a / b : a;
  return { num: isFinite(num) ? num : null, unit: m[3] || "" };
}

/** Trim trailing zeros for display, e.g. 2 → "2", 1.5 → "1.5". */
export function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function sumTotals(items: Pick<FoodLog, keyof DayTotals>[] | FoodItem[]): DayTotals {
  return items.reduce<DayTotals>(
    (a, i) => ({
      calories: a.calories + (i.calories || 0),
      protein: a.protein + (i.protein || 0),
      carbs: a.carbs + (i.carbs || 0),
      fat: a.fat + (i.fat || 0),
      fiber: a.fiber + (i.fiber || 0),
      sugar: a.sugar + (i.sugar || 0),
      sodium: a.sodium + (i.sodium || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 }
  );
}

export const round = (n: number) => Math.round(n);

export function displayWeight(kg: number, units: Units): { value: number; unit: string } {
  return units === "imperial"
    ? { value: Math.round(kgToLb(kg) * 10) / 10, unit: "lb" }
    : { value: Math.round(kg * 10) / 10, unit: "kg" };
}

export function displayHeight(cm: number, units: Units): string {
  if (units === "imperial") {
    const totalIn = Math.round(cmToIn(cm));
    return `${Math.floor(totalIn / 12)}'${totalIn % 12}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

export function relativeDay(iso: string, today: string): string {
  if (iso === today) return "Today";
  const a = new Date(iso + "T00:00:00").getTime();
  const b = new Date(today + "T00:00:00").getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 1) return "Yesterday";
  return prettyDate(iso);
}
