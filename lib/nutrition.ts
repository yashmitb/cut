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

import type { Activity, GoalType, Rate, Sex } from "./types";

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

// kcal/day surplus for a lean bulk (smaller than a cut deficit — slow gain limits fat).
export const RATE_SURPLUS: Record<Rate, number> = {
  mild: 150,
  moderate: 300,
  aggressive: 450,
};

export const RATE_LABELS: Record<Rate, { title: string; sub: string; perWeekKg: number }> = {
  mild: { title: "Relaxed", sub: "~0.25 kg / 0.5 lb per week", perWeekKg: 0.25 },
  moderate: { title: "Steady", sub: "~0.5 kg / 1 lb per week", perWeekKg: 0.5 },
  aggressive: { title: "Aggressive", sub: "~0.75 kg / 1.6 lb per week", perWeekKg: 0.75 },
};

// labels tuned to direction (a "fast" bulk still gains slowly)
export const GAIN_RATE_LABELS: Record<Rate, { title: string; sub: string }> = {
  mild: { title: "Lean & slow", sub: "~0.13 kg / 0.3 lb per week" },
  moderate: { title: "Steady", sub: "~0.27 kg / 0.6 lb per week" },
  aggressive: { title: "Faster", sub: "~0.4 kg / 0.9 lb per week" },
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
  deficit: number; // applied energy gap, magnitude (deficit for cut, surplus for gain)
  direction: "loss" | "gain" | "none";
  floored: boolean; // true if the calorie floor clamped the deficit
  weeksToGoal: number | null;
  projectedWeeklyKg: number; // magnitude of weekly change
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
  goal_type?: GoalType; // defaults to "cut" for backward compatibility
}

export function mifflinBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === "male" ? 5 : -161);
}

export function computeTargets(input: TargetInput): MacroTargets {
  const { age, sex, height_cm, weight_kg, goal_weight_kg, activity, rate } = input;
  const goalType: GoalType = input.goal_type ?? "cut";

  const bmr = mifflinBMR(sex, weight_kg, height_cm, age);
  const tdee = bmr * ACTIVITY_FACTORS[activity];
  const floor = sex === "male" ? 1500 : 1200;

  let target = tdee;
  let floored = false;
  let direction: MacroTargets["direction"] = "none";

  if (goalType === "cut") {
    direction = "loss";
    target = tdee - RATE_DEFICIT[rate];
    if (target < floor) { target = floor; floored = true; }
  } else if (goalType === "gain") {
    direction = "gain";
    target = tdee + RATE_SURPLUS[rate];
  } else {
    direction = "none";
    target = tdee; // maintain
  }

  const energyGap = target - tdee; // negative for cut, positive for gain
  const target_calories = Math.round(target / 10) * 10;

  // --- macros ---
  // Protein scaled to bodyweight: 2.0 g/kg on a cut/bulk (muscle protection/growth),
  // 1.8 g/kg at maintenance. Fat to a healthy floor, carbs fill the rest.
  const proteinPerKg = goalType === "maintain" ? 1.8 : 2.0;
  const fatPerKg = goalType === "cut" ? 0.8 : 0.9;
  const target_protein = Math.round(weight_kg * proteinPerKg);
  const target_fat = Math.round(weight_kg * fatPerKg);
  const proteinCals = target_protein * 4;
  const fatCals = target_fat * 9;
  const carbCals = Math.max(0, target_calories - proteinCals - fatCals);
  const target_carbs = Math.round(carbCals / 4);
  const target_fiber = Math.round((target_calories / 1000) * 14);

  // --- projections ---
  const projectedWeeklyKg = +((Math.abs(energyGap) * 7) / KCAL_PER_KG_FAT).toFixed(2);
  const delta = goalType === "gain" ? goal_weight_kg - weight_kg : weight_kg - goal_weight_kg;
  const weeksToGoal =
    goalType !== "maintain" && delta > 0 && projectedWeeklyKg > 0
      ? Math.ceil(delta / projectedWeeklyKg)
      : null;

  // --- warnings ---
  const warnings: string[] = [];
  const bmi = weight_kg / Math.pow(height_cm / 100, 2);
  if (goalType === "cut") {
    if (floored) {
      warnings.push(`Your chosen pace would drop you below a safe ${floor} kcal floor, so we capped it. The cut will be a little slower than the label.`);
    }
    if (rate === "aggressive") {
      warnings.push("Aggressive cuts risk muscle loss and fatigue. Hit your protein target every day and consider a diet break every 6–8 weeks.");
    }
    if (goal_weight_kg / Math.pow(height_cm / 100, 2) < 18.5) {
      warnings.push("Your goal weight lands in the underweight BMI range — double-check it's right for you.");
    }
    if (bmi < 20 && rate === "aggressive") {
      warnings.push("You're already lean — a gentler pace will protect your muscle and performance.");
    }
    if (delta <= 0) {
      warnings.push("Your goal weight is at or above your current weight. Switch to Maintain or Lean bulk if you're not cutting.");
    }
  } else if (goalType === "gain") {
    if (rate === "aggressive") {
      warnings.push("Faster bulks add more fat. If the scale climbs more than ~0.5% of bodyweight per week, ease the surplus.");
    }
    if (delta <= 0) {
      warnings.push("Your goal weight is at or below your current weight. Switch to Cut or Maintain if you're not bulking.");
    }
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target_calories,
    target_protein,
    target_carbs,
    target_fat,
    target_fiber,
    deficit: Math.round(Math.abs(energyGap)),
    direction,
    floored,
    weeksToGoal,
    projectedWeeklyKg,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Adaptive metabolism — learn the user's REAL maintenance from data instead of
// trusting the onboarding formula. Energy balance: every kg of weight change
// ≈ 7700 kcal, so  maintenance ≈ avg intake + (weight lost over the window)·7700/days.
// ---------------------------------------------------------------------------

export interface TrendPoint { date: string; calories: number; weight_kg: number | null }

/** Least-squares slope of weight (kg) per day over points that have a weight. */
export function weightSlopePerDay(points: TrendPoint[]): number | null {
  const ws = points
    .map((p, i) => ({ x: i, y: p.weight_kg }))
    .filter((p): p is { x: number; y: number } => p.y != null);
  if (ws.length < 2) return null;
  const n = ws.length;
  const sx = ws.reduce((a, p) => a + p.x, 0);
  const sy = ws.reduce((a, p) => a + p.y, 0);
  const sxx = ws.reduce((a, p) => a + p.x * p.x, 0);
  const sxy = ws.reduce((a, p) => a + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom; // kg/day (point spacing assumed daily)
}

export interface AdaptiveEstimate {
  tdee: number;          // estimated real maintenance, kcal/day
  weeklyKg: number;      // signed weekly weight change (negative = losing)
  avgIntake: number;     // avg kcal logged across the window
  loggedDays: number;
  spanDays: number;
}

/**
 * Estimate real maintenance from logged intake + measured weight trend.
 * Returns null until there's enough signal (≥10 logged days, ≥2 weights ≥10 days apart).
 */
export function estimateAdaptiveTDEE(points: TrendPoint[]): AdaptiveEstimate | null {
  const logged = points.filter((p) => p.calories > 0);
  const weights = points.filter((p) => p.weight_kg != null);
  if (logged.length < 10 || weights.length < 2) return null;

  const firstW = points.findIndex((p) => p.weight_kg != null);
  const lastW = points.length - 1 - [...points].reverse().findIndex((p) => p.weight_kg != null);
  const spanDays = lastW - firstW;
  if (spanDays < 10) return null;

  const slope = weightSlopePerDay(points); // kg/day
  if (slope == null) return null;

  const avgIntake = Math.round(logged.reduce((a, p) => a + p.calories, 0) / logged.length);
  // maintenance = intake + daily energy gap implied by the trend
  const dailyGapKcal = slope * KCAL_PER_KG_FAT; // negative when losing
  const tdee = Math.round(avgIntake - dailyGapKcal);
  return {
    tdee,
    weeklyKg: +(slope * 7).toFixed(2),
    avgIntake,
    loggedDays: logged.length,
    spanDays,
  };
}

/** Centered N-day moving average of weight; nulls stay null. */
export function smoothWeights(points: TrendPoint[], window = 7): (number | null)[] {
  const half = Math.floor(window / 2);
  return points.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j++) {
      const w = points[j].weight_kg;
      if (w != null) { sum += w; count++; }
    }
    return count ? sum / count : null;
  });
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
