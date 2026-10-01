import { missingMeals, listMeals, loggingStreak, suggestTime, parseHHMM } from "../.test-out/reminders.js";
import assert from "node:assert";

let passed = 0;
const eq = (name, a, b) => { assert.deepStrictEqual(a, b, name); passed++; console.log("  ✓", name); };

console.log("parseHHMM");
eq("07:30", parseHHMM("07:30"), 450);
eq("off ('')", parseHHMM(""), null);
eq("bad", parseHHMM("25:00"), null);

console.log("missingMeals");
const times = { breakfast: "08:30", lunch: "12:30", dinner: "19:00" };
eq("morning: nothing due yet", missingMeals(times, new Set(), 8 * 60), []);
eq("2pm: breakfast+lunch missing", missingMeals(times, new Set(), 14 * 60), ["breakfast", "lunch"]);
eq("2pm, lunch logged", missingMeals(times, new Set(["lunch"]), 14 * 60), ["breakfast"]);
eq("snack doesn't count", missingMeals(times, new Set(["snack"]), 23 * 60), ["breakfast", "lunch", "dinner"]);
eq("breakfast switched off", missingMeals({ ...times, breakfast: "" }, new Set(["lunch"]), 20 * 60), ["dinner"]);
eq("exactly at time counts", missingMeals(times, new Set(), 19 * 60).includes("dinner"), true);

console.log("listMeals");
eq("one", listMeals(["dinner"]), "Dinner");
eq("two", listMeals(["lunch", "dinner"]), "Lunch & dinner");
eq("three", listMeals(["breakfast", "lunch", "dinner"]), "Breakfast, lunch & dinner");

console.log("loggingStreak");
const days = new Set(["2026-09-27", "2026-09-28", "2026-09-29"]);
eq("today unlogged → counts through yesterday", loggingStreak(days, "2026-09-30"), 3);
eq("today logged", loggingStreak(new Set([...days, "2026-09-30"]), "2026-09-30"), 4);
eq("gap breaks it", loggingStreak(new Set(["2026-09-25", "2026-09-29"]), "2026-09-30"), 1);
eq("across month end", loggingStreak(new Set(["2026-02-27", "2026-02-28", "2026-03-01"]), "2026-03-01"), 3);
eq("none", loggingStreak(new Set(), "2026-09-30"), 0);

console.log("suggestTime");
eq("needs 3 samples", suggestTime([600, 610]), null);
eq("median + 20, rounded to 5", suggestTime([12 * 60 + 2, 12 * 60 + 40, 12 * 60 + 13]), "12:35");
eq("even count averages middle two", suggestTime([480, 500, 520, 540], 0), "08:30");
eq("clamped before midnight", suggestTime([1430, 1435, 1439]), "23:55");

console.log(`\nALL ${passed} REMINDER ASSERTIONS PASSED`);
