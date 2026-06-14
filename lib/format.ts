import type { FoodItem, FoodLog, DayTotals, Units } from "./types";
import { cmToIn, kgToLb } from "./nutrition";

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
