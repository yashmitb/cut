// Deterministic sanity checks on AI nutrition numbers. Pure — used by the
// server (to flag low-trust items) and the review screen (live, while editing).
import type { FoodItem } from "./types";

/** Calories implied by the macros (Atwater: 4 kcal/g protein & carbs, 9 kcal/g fat). */
export function atwaterKcal(it: Pick<FoodItem, "protein" | "carbs" | "fat">): number {
  return 4 * (it.protein || 0) + 4 * (it.carbs || 0) + 9 * (it.fat || 0);
}

// Alcohol adds ~7 kcal/g that isn't in any macro, so drinks legitimately miss.
const ALCOHOL = /\b(beer|wine|vodka|whiskey|whisky|rum|gin|tequila|sake|cocktail|margarita|mojito|cider|seltzer|spritz|liqueur|champagne|prosecco|ipa|lager|stout|sangria)\b/i;

/**
 * If an item's calories disagree with its macros by more than `tolerance`,
 * returns the macro-implied calories; otherwise null. Tiny items are skipped
 * (rounding dominates), and so are alcoholic drinks.
 */
export function macroMismatch(it: FoodItem, tolerance = 0.15): number | null {
  const kcal = it.calories || 0;
  const implied = atwaterKcal(it);
  if (Math.max(kcal, implied) < 40) return null;
  if (ALCOHOL.test(it.name || "")) return null;
  const off = Math.abs(kcal - implied) / Math.max(kcal, implied);
  return off > tolerance ? Math.round(implied) : null;
}

// ---- added cooking fat -----------------------------------------------------
// The AI itemizes cooking oil/butter separately (it can't see it in a photo),
// so the user can set it with one tap instead of trusting a guess.

export type FatLevel = "none" | "light" | "normal" | "heavy";
export const FAT_LEVELS: { level: FatLevel; label: string; tbsp: number; qty: string }[] = [
  { level: "none", label: "None", tbsp: 0, qty: "" },
  { level: "light", label: "Light", tbsp: 1 / 3, qty: "1 tsp" },
  { level: "normal", label: "Normal", tbsp: 1, qty: "1 tbsp" },
  { level: "heavy", label: "Heavy", tbsp: 2, qty: "2 tbsp" },
];

// USDA FoodData Central, per tablespoon.
const PER_TBSP = {
  butter: { calories: 102, fat: 11.5 },
  ghee: { calories: 112, fat: 12.7 },
  oil: { calories: 119, fat: 13.5 },
};

function fatKind(name: string): keyof typeof PER_TBSP {
  if (/ghee/i.test(name)) return "ghee";
  if (/butter/i.test(name) && !/peanut|almond|nut|seed/i.test(name)) return "butter";
  return "oil";
}

/** Tablespoons of added fat currently in the list (AI's guess or the user's pick). */
export function addedFatTbsp(items: FoodItem[]): number {
  return items
    .filter((i) => i.added_fat)
    .reduce((a, i) => a + (i.calories || 0) / PER_TBSP[fatKind(i.name)].calories, 0);
}

/**
 * The preset matching the current added fat, or null when it sits between
 * presets (e.g. the AI guessed 1.5 tbsp) — then no button is highlighted, so we
 * never imply the user chose something they didn't.
 */
export function currentFatLevel(items: FoodItem[]): FatLevel | null {
  if (!items.some((i) => i.added_fat)) return "none";
  const tbsp = addedFatTbsp(items);
  const hit = FAT_LEVELS.find((f) => f.tbsp > 0 && Math.abs(f.tbsp - tbsp) <= Math.max(0.1, f.tbsp * 0.15));
  return hit ? hit.level : null;
}

/** Replace all added-fat items with a single one at `level` (or none). */
export function setFatLevel(items: FoodItem[], level: FatLevel): FoodItem[] {
  const existing = items.find((i) => i.added_fat);
  const rest = items.filter((i) => !i.added_fat);
  const preset = FAT_LEVELS.find((f) => f.level === level)!;
  if (preset.tbsp === 0) return rest;
  const name = existing?.name || "Cooking oil";
  const per = PER_TBSP[fatKind(name)];
  return [
    ...rest,
    {
      name,
      quantity: preset.qty,
      calories: Math.round(per.calories * preset.tbsp),
      protein: 0,
      carbs: 0,
      fat: Math.round(per.fat * preset.tbsp * 10) / 10,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      confidence: 1, // the user told us
      added_fat: true,
    },
  ];
}
