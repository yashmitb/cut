import { computeTargets, estimateAdaptiveTDEE, weightSlopePerDay, smoothWeights } from "../.test-out/nutrition.js";
import assert from "node:assert";

let passed = 0;
const ok = (name, cond) => { assert.ok(cond, name); passed++; console.log("  ✓", name); };
const near = (name, a, b, tol = 1) => { assert.ok(Math.abs(a - b) <= tol, `${name} (got ${a}, want ~${b})`); passed++; console.log("  ✓", name, `= ${a}`); };

const base = { age: 22, sex: "male", height_cm: 178, weight_kg: 80, goal_weight_kg: 72, activity: "moderate", rate: "moderate" };

console.log("computeTargets — CUT");
{
  const t = computeTargets({ ...base, goal_type: "cut" });
  // BMR Mifflin: 10*80+6.25*178-5*22+5 = 800+1112.5-110+5 = 1807.5; TDEE*1.55 = 2801.6
  near("tdee", t.tdee, 2802, 2);
  ok("direction loss", t.direction === "loss");
  ok("target below tdee", t.target_calories < t.tdee);
  near("deficit ~550", t.deficit, 550, 60);
  near("protein 2.0g/kg", t.target_protein, 160, 1);
  near("fat 0.8g/kg", t.target_fat, 64, 1);
  ok("weeksToGoal positive", t.weeksToGoal > 0);
  ok("carbs positive", t.target_carbs > 0);
}

console.log("computeTargets — MAINTAIN");
{
  const t = computeTargets({ ...base, goal_type: "maintain" });
  ok("direction none", t.direction === "none");
  near("target == tdee (rounded)", t.target_calories, t.tdee, 6);
  near("deficit 0", t.deficit, 0, 6);
  ok("weeksToGoal null", t.weeksToGoal === null);
  near("protein 1.8g/kg", t.target_protein, 144, 1);
}

console.log("computeTargets — GAIN");
{
  const t = computeTargets({ ...base, goal_weight_kg: 85, goal_type: "gain" });
  ok("direction gain", t.direction === "gain");
  ok("target above tdee", t.target_calories > t.tdee);
  near("surplus ~300", t.deficit, 300, 40);
  ok("weeksToGoal positive (to 85)", t.weeksToGoal > 0);
}

console.log("computeTargets — backward compat (no goal_type => cut)");
{
  const t = computeTargets(base);
  ok("defaults to loss", t.direction === "loss");
}

console.log("computeTargets — floor clamps aggressive cut for small female");
{
  const t = computeTargets({ age: 30, sex: "female", height_cm: 160, weight_kg: 52, goal_weight_kg: 48, activity: "sedentary", rate: "aggressive", goal_type: "cut" });
  ok("floored true", t.floored === true);
  ok("target >= 1200 floor", t.target_calories >= 1200);
  ok("has warning", t.warnings.length > 0);
}

console.log("weightSlopePerDay");
{
  // perfectly linear -0.1 kg/day
  const pts = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, calories: 2000, weight_kg: 80 - 0.1 * i }));
  near("slope -0.1/day", weightSlopePerDay(pts), -0.1, 1e-6);
  ok("null with <2 weights", weightSlopePerDay([{ date: "a", calories: 0, weight_kg: null }]) === null);
}

console.log("estimateAdaptiveTDEE");
{
  // 21 days, eat 2000/day, lose 0.1 kg/day => maintenance = 2000 + 0.1*7700 = 2770
  const pts = Array.from({ length: 21 }, (_, i) => ({ date: `d${i}`, calories: 2000, weight_kg: 80 - 0.1 * i }));
  const est = estimateAdaptiveTDEE(pts);
  ok("returns estimate", est !== null);
  near("adaptive tdee ~2770", est.tdee, 2770, 5);
  near("weeklyKg ~ -0.7", est.weeklyKg, -0.7, 0.05);
  ok("loggedDays 21", est.loggedDays === 21);

  // insufficient data => null
  ok("null when too few logged", estimateAdaptiveTDEE(pts.slice(0, 5)) === null);
  const noWeights = Array.from({ length: 21 }, (_, i) => ({ date: `d${i}`, calories: 2000, weight_kg: null }));
  ok("null when no weights", estimateAdaptiveTDEE(noWeights) === null);
}

console.log("smoothWeights");
{
  const pts = [80, 81, 79, 80, 82].map((w, i) => ({ date: `d${i}`, calories: 0, weight_kg: w }));
  const sm = smoothWeights(pts, 3);
  near("centered avg at idx1", sm[1], (80 + 81 + 79) / 3, 1e-6);
  ok("nulls preserved", smoothWeights([{ date: "a", calories: 0, weight_kg: null }], 3)[0] === null);
}

console.log(`\nALL ${passed} ASSERTIONS PASSED`);
