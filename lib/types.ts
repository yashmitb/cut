// Shared domain types for Cut.

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "very" | "extra";
export type Rate = "mild" | "moderate" | "aggressive";
export type Units = "metric" | "imperial";

export interface Profile {
  id: string;
  name: string | null;
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number;
  activity: Activity;
  rate: Rate;
  units: Units;
  // computed targets (stored so the daily view is instant)
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_fiber: number;
  created_at?: string;
  updated_at?: string;
}

export type FoodSource = "image" | "manual" | "chat" | "quick";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_META: Record<MealType, { label: string }> = {
  breakfast: { label: "Breakfast" },
  lunch: { label: "Lunch" },
  dinner: { label: "Dinner" },
  snack: { label: "Snacks" },
};

export const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function mealForHour(h: number): MealType {
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

/** A single nutrition estimate for one food item. */
export interface FoodItem {
  name: string;
  quantity: string; // human-readable portion, e.g. "1 cup", "6 oz"
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number; // mg
  confidence: number; // 0..1
  assumptions?: string; // what the model assumed (oil, cooking method, etc.)
}

export interface FoodLog extends FoodItem {
  id: number;
  log_date: string; // YYYY-MM-DD (user-local)
  meal: MealType;
  source: FoodSource;
  group_id: string | null; // items sharing a group_id are one combined entry
  group_label: string | null; // display name for the group (e.g. "Pre-workout shake")
  created_at: string;
}

/** A recipe-style suggestion from the "What should I eat?" coach. */
export interface MealSuggestion {
  dish: string;
  blurb: string; // why it fits what's left
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  ingredients: string[];
  steps: string[];
}

export interface WeightLog {
  id: number;
  log_date: string;
  weight_kg: number;
  created_at: string;
}

/** Structured response the model returns for an image/text analysis. */
export interface AnalysisResult {
  items: FoodItem[];
  overall_confidence: number; // 0..1
  needs_clarification: boolean;
  clarification_question: string | null;
  notes: string | null;
}

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export const MACRO_META = {
  calories: { label: "Calories", unit: "kcal", color: "var(--p-cal)" },
  protein: { label: "Protein", unit: "g", color: "var(--p-protein)" },
  carbs: { label: "Carbs", unit: "g", color: "var(--p-carbs)" },
  fat: { label: "Fat", unit: "g", color: "var(--p-fat)" },
  fiber: { label: "Fiber", unit: "g", color: "var(--p-fiber)" },
} as const;
