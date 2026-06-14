// Nutrition science for cutting — all the math the onboarding + profile use.
//
// References used to pick these numbers:
//  • BMR: Mifflin-St Jeor (1990) — most accurate predictive equation for non-obese
//    and obese adults.
//  • TDEE: BMR × activity factor (standard Harris-Benedict activity multipliers).
//  • Deficit: 1 kg body fat ≈ 7700 kcal; 1 lb ≈ 3500 kcal.
//  • Protein on a deficit: 1.6–2.4 g/kg preserves lean mass (Helms et al. 2014,
//    ISSN position stand). We target ~2.0 g/kg of bodyweight.
//  • Fat floor: ~0.8 g/kg keeps hormones healthy; never below ~0.5 g/kg.
//  • Fiber: 14 g per 1000 kcal (Institute of Medicine / Dietary Guidelines).
//  • Calorie floor: don't program below ~1500 (men) / 1200 (women) kcal.

import type { Activity, Rate, Sex } from "./types";

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2, // desk job, little exercise
  light: 1.375, // light exercise 1–3 days/wk
  moderate: 1.55, // moderate exercise 3–5 days/wk
  very: 1.725, // hard exercise 6–7 days/wk
  extra: 1.9, // physical job or 2x/day training
};

export const ACTIVITY_LABELS: Record<Activity, { title: string; sub: string }> = {
  sedentary: { title: "Sedentary", sub: "Desk job, little exercise" },
  light: { title: "Light", sub: "Exercise 1–3 days / week" },
  moderate: { title: "Moderate", sub: "Exercise 3–5 days / week" },
  very: { title: "Very active", sub: "Hard exercise 6–7 days / week" },
  extra: { title: "Athlete", sub: "Physical job or 2× training" },
};

// kcal/day deficit for each aggressiveness level (≈ 0.25 / 0.5 / 0.75 kg per week)
export const RATE_DEFICIT: Record<Rate, number> = {
  mild: 275,
  moderate: 550,
  aggressive: 825,
};

export const RATE_LABELS: Record<Rate, { title: string; sub: string; perWeekKg: number }> = {
  mild: { title: "Relaxed", sub: "~0.25 kg / 0.5 lb per week", perWeekKg: 0.25 },
  moderate: { title: "Steady", sub: "~0.5 kg / 1 lb per week", perWeekKg: 0.5 },
  aggressive: { title: "Aggressive", sub: "~0.75 kg / 1.6 lb per week", perWeekKg: 0.75 },
};

const KCAL_PER_KG_FAT = 7700;

export interface MacroTargets {
  bmr: number;
  tdee: number;
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_fiber: number;
  deficit: number; // actual applied deficit after flooring
  floored: boolean; // true if the calorie floor clamped the deficit
  weeksToGoal: number | null;
  projectedWeeklyKg: number;
  warnings: string[];
}

export interface TargetInput {
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number;
  activity: Activity;
  rate: Rate;
}

export function mifflinBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === "male" ? 5 : -161);
}

export function computeTargets(input: TargetInput): MacroTargets {
  const { age, sex, height_cm, weight_kg, goal_weight_kg, activity, rate } = input;

  const bmr = mifflinBMR(sex, weight_kg, height_cm, age);
  const tdee = bmr * ACTIVITY_FACTORS[activity];

  const requestedDeficit = RATE_DEFICIT[rate];
  const floor = sex === "male" ? 1500 : 1200;

  let target = tdee - requestedDeficit;
  let floored = false;
  if (target < floor) {
    target = floor;
    floored = true;
  }

  const appliedDeficit = Math.max(0, tdee - target);
  const target_calories = Math.round(target / 10) * 10;

  // --- macros ---
  // Protein scaled to bodyweight (2.0 g/kg), fat to a healthy floor (0.8 g/kg),
  // carbs fill the remaining calories.
  const target_protein = Math.round(weight_kg * 2.0);
  const target_fat = Math.round(weight_kg * 0.8);
  const proteinCals = target_protein * 4;
  const fatCals = target_fat * 9;
  const carbCals = Math.max(0, target_calories - proteinCals - fatCals);
  const target_carbs = Math.round(carbCals / 4);
  const target_fiber = Math.round((target_calories / 1000) * 14);

  // --- projections ---
  const projectedWeeklyKg = +((appliedDeficit * 7) / KCAL_PER_KG_FAT).toFixed(2);
  const toLose = weight_kg - goal_weight_kg;
  const weeksToGoal =
    toLose > 0 && projectedWeeklyKg > 0 ? Math.ceil(toLose / projectedWeeklyKg) : null;

  // --- warnings ---
  const warnings: string[] = [];
  if (floored) {
    warnings.push(
      `Your chosen pace would drop you below a safe ${floor} kcal floor, so we capped it. The cut will be a little slower than the label.`
    );
  }
  if (rate === "aggressive") {
    warnings.push(
      "Aggressive cuts risk muscle loss and fatigue. Hit your protein target every day and consider a diet break every 6–8 weeks."
    );
  }
  const bmi = weight_kg / Math.pow(height_cm / 100, 2);
  if (goal_weight_kg / Math.pow(height_cm / 100, 2) < 18.5) {
    warnings.push("Your goal weight lands in the underweight BMI range — double-check it's right for you.");
  }
  if (bmi < 20 && rate === "aggressive") {
    warnings.push("You're already lean — a gentler pace will protect your muscle and performance.");
  }
  if (toLose <= 0) {
    warnings.push("Your goal weight is at or above your current weight. This plan is built for losing weight.");
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target_calories,
    target_protein,
    target_carbs,
    target_fat,
    target_fiber,
    deficit: Math.round(appliedDeficit),
    floored,
    weeksToGoal,
    projectedWeeklyKg,
    warnings,
  };
}

// ---- unit helpers ----
export const lbToKg = (lb: number) => lb * 0.45359237;
export const kgToLb = (kg: number) => kg / 0.45359237;
export const inToCm = (inch: number) => inch * 2.54;
export const cmToIn = (cm: number) => cm / 2.54;

export function todayLocal(): string {
  // YYYY-MM-DD in the user's local timezone
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
