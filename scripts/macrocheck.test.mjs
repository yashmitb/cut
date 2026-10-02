import { atwaterKcal, macroMismatch, currentFatLevel, setFatLevel, addedFatTbsp } from "../.test-out/macrocheck.js";
import assert from "node:assert";
let passed = 0;
const eq = (name, a, b) => { assert.deepStrictEqual(a, b, name); passed++; console.log("  ✓", name); };
const item = (o) => ({ name: "x", quantity: "", calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, confidence: 0.9, ...o });

console.log("atwater / mismatch");
eq("chicken 6oz: 4*53+9*6", atwaterKcal({ protein: 53, carbs: 0, fat: 6 }), 266);
eq("consistent item passes", macroMismatch(item({ calories: 270, protein: 53, fat: 6 })), null);
eq("made-up calories flagged → implied", macroMismatch(item({ calories: 450, protein: 53, fat: 6 })), 266);
eq("within 15% passes", macroMismatch(item({ calories: 300, protein: 53, fat: 6 })), null);
eq("tiny items skipped", macroMismatch(item({ calories: 30, protein: 1 })), null);
eq("beer skipped (alcohol kcal)", macroMismatch(item({ name: "IPA beer", calories: 200, carbs: 13, protein: 2 })), null);
eq("'peanut butter' is not alcohol", macroMismatch(item({ name: "Peanut butter", calories: 400, protein: 8, carbs: 6, fat: 16 })), 200);
eq("'ginger' doesn't match 'gin'", macroMismatch(item({ name: "Ginger chicken", calories: 600, protein: 40, carbs: 10, fat: 10 })), 290);
eq("too-low calories → suggests fiber-adjusted floor", macroMismatch(item({ calories: 50, protein: 10, carbs: 30, fat: 5, fiber: 10 })), 165);
// real USDA foods must never be flagged
for (const [name, cal, p, c, f, fib] of [
  ["Broccoli, 2 cups", 62, 5.2, 12.1, 0.7, 4.7], ["Avocado", 240, 3, 12.8, 22, 10], ["Chia seeds, 1 oz", 138, 4.7, 12, 8.7, 9.8],
  ["Almonds, 1 oz", 164, 6, 6.1, 14.2, 3.5], ["Black beans, 1 cup", 227, 15.2, 40.8, 0.9, 15], ["Quest protein bar", 200, 21, 22, 8, 14],
  ["Raspberries, 1 cup", 64, 1.5, 14.7, 0.8, 8], ["Lentils, 1 cup", 230, 17.9, 39.9, 0.8, 15.6], ["Chicken breast, 6 oz", 280, 53, 0, 6, 0],
  ["White rice, 1 cup", 205, 4.3, 44.5, 0.4, 0.6], ["Greek yogurt, 1 cup", 130, 23, 9, 0.7, 0], ["Banana", 105, 1.3, 27, 0.4, 3.1],
  ["Whole egg, large", 72, 6.3, 0.4, 4.8, 0], ["Olive oil, 1 tbsp", 119, 0, 0, 13.5, 0], ["Oreo cookies, 3", 160, 1, 25, 7, 1],
]) eq(`USDA ${name} passes`, macroMismatch(item({ name, calories: cal, protein: p, carbs: c, fat: f, fiber: fib })), null);

console.log("cooking fat");
const plate = [item({ name: "Chicken", calories: 270, protein: 53, fat: 6 })];
eq("no fat item → none", currentFatLevel(plate), "none");
const normal = setFatLevel(plate, "normal");
eq("normal → 1 tbsp oil, 119 kcal, 13.5 g fat", normal.at(-1), { ...item({ name: "Cooking oil", quantity: "1 tbsp", calories: 119, fat: 13.5, confidence: 1 }), added_fat: true });
eq("food items untouched", normal[0], plate[0]);
eq("reads back as normal", currentFatLevel(normal), "normal");
eq("heavy replaces (no duplicates)", setFatLevel(normal, "heavy").filter((i) => i.added_fat).length, 1);
eq("heavy = 238 kcal", setFatLevel(normal, "heavy").at(-1).calories, 238);
eq("none removes it", setFatLevel(normal, "none"), plate);
const butter = [...plate, item({ name: "Butter", quantity: "1 tbsp", calories: 100, fat: 11, added_fat: true })];
eq("AI's butter guess reads as normal", currentFatLevel(butter), "normal");
eq("keeps butter, uses butter values (light = 34 kcal)", setFatLevel(butter, "light").at(-1).calories, 34);
eq("AI 1.5 tbsp (between presets) → nothing highlighted", currentFatLevel([item({ name: "Cooking oil", calories: 179, fat: 20, added_fat: true })]), null);
eq("…and reports 1.5 tbsp", Math.round(addedFatTbsp([item({ name: "Cooking oil", calories: 179, fat: 20, added_fat: true })]) * 10) / 10, 1.5);
eq("AI ~2 tbsp (230 kcal) → heavy", currentFatLevel([item({ name: "Olive oil", calories: 230, fat: 26, added_fat: true })]), "heavy");
console.log(`\nALL ${passed} MACROCHECK ASSERTIONS PASSED`);
