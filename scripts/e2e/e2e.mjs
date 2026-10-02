// End-to-end checks against a running Cut server (see run.sh, which sets up a
// throwaway Postgres, the fakes in fakes.cjs, and the server in UTC).
// Env: E2E_URL (app), E2E_NOKEY_URL (same app with no Gemini key), E2E_DB.
import postgres from "postgres";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ece from "http_ece";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // fake push endpoint is self-signed
const U = process.env.E2E_URL || "http://localhost:3012";
const NOKEY = process.env.E2E_NOKEY_URL;
const sql = postgres(process.env.E2E_DB || "postgres://postgres@localhost:55432/postgres", { onnotice: () => {} });
const TZ = "America/Los_Angeles";
const GEMINI = "http://localhost:4600";
const PUSH = "https://localhost:4555";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, "→", typeof extra === "string" ? extra : JSON.stringify(extra)); }
};
const section = (s) => console.log(`\n${s}`);
const req = async (path, init, base = U) => {
  const r = await fetch(base + path, init);
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t; }
  return { s: r.status, b };
};
const post = (path, body, method = "POST", base = U) => req(path, { method, body: JSON.stringify(body) }, base);
const ld = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hm = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const today = ld(new Date());
const dayAgo = (n) => ld(new Date(Date.now() - n * 864e5));
const ago = (min) => hm(new Date(Date.now() - min * 60000));
const localMin = (() => { const [h, m] = hm(new Date()).split(":").map(Number); return h * 60 + m; })();
const gemini = { mode: (m) => fetch(GEMINI + "/__mode", { method: "POST", body: m }), seen: async () => (await fetch(GEMINI + "/__seen")).json() };
const image = "data:image/jpeg;base64," + crypto.randomBytes(256).toString("base64"); // the fake model doesn't look

console.log(`server ${U} · local ${today} ${hm(new Date())} (${TZ}) · server UTC ${new Date().toISOString().slice(0, 16)}`);
await sql`TRUNCATE profile, food_logs, weight_logs, favorites, corrections, push_subs, quick_tokens, app_settings`;
await gemini.mode("ok");

// ---------------------------------------------------------------------------
section("PROFILE & DATES (server runs in UTC, user in Pacific)");
ok("no profile yet", (await req("/api/profile")).b.profile === null);
const prof = { age: 25, sex: "male", height_cm: 178, weight_kg: 80, goal_weight_kg: 72, activity: "moderate", rate: "moderate", goal_type: "cut", units: "imperial", date: today };
let r = await post("/api/profile", prof);
ok("save profile", r.s === 200 && r.b.profile.target_calories > 0);
const target = r.b.profile.target_calories;
ok("weight seeded on the user's local date", (await sql`SELECT log_date::text d FROM weight_logs`)[0]?.d === today);
ok("missing fields → 400", (await post("/api/profile", { ...prof, age: "" })).s === 400);

section("LOGGING");
r = await post("/api/log", { date: today, meal: "lunch", items: [{ name: "Rice", quantity: "1 cup", calories: 200, protein: 4 }, { name: "Chicken", quantity: "6 oz", calories: 280, protein: 50 }] });
ok("add 2 items", r.s === 200 && r.b.items.length === 2);
const gid = crypto.randomUUID();
r = await post("/api/log", { date: today, meal: "snack", items: [{ name: "Whey", calories: 120 }, { name: "Milk", calories: 100 }], group_id: gid, group_label: "Shake" });
ok("add group", r.b.items.filter((i) => i.group_id === gid).length === 2);
r = await post("/api/log", { date: today, meal: "lunch", items: [{ name: "ok", calories: 1 }, { name: null, calories: 1 }] });
let day = (await req(`/api/log?date=${today}`)).b.items;
ok("failing batch → 500 with no partial rows", r.s === 500 && day.length === 4);
const rice = day.find((i) => i.name === "Rice");
r = await post("/api/log", { id: rice.id, name: "Rice", quantity: "2 cup", calories: 400, meal: "dinner" }, "PATCH");
ok("edit item + move meal", r.b.items.find((i) => i.id === rice.id)?.meal === "dinner");
r = await post("/api/log", { group_id: gid, meal: "breakfast", group_label: "AM Shake" }, "PATCH");
ok("move + rename group", r.b.items.filter((i) => i.group_id === gid).every((i) => i.meal === "breakfast" && i.group_label === "AM Shake"));
ok("delete item", (await req(`/api/log?id=${rice.id}&date=${today}`, { method: "DELETE" })).b.items.length === 3);
await post("/api/log", { date: dayAgo(1), meal: "dinner", items: [{ name: "Salmon", calories: 350 }] });
ok("copy one meal from yesterday", (await post("/api/copy", { from: dayAgo(1), to: today, meal: "dinner" })).b.copied === 1);
ok("copy from empty day → 400", (await post("/api/copy", { from: "2020-01-01", to: today })).s === 400);
ok("delete group", !(await req(`/api/log?group=${gid}&date=${today}`, { method: "DELETE" })).b.items.some((i) => i.group_id === gid));
ok("today endpoint (profile + items)", (await req(`/api/today?date=${today}`)).b.items.length > 0);

section("RECENTS & FAVORITES");
await post("/api/log", { date: today, meal: "dinner", items: [{ name: "Cooking oil", quantity: "1 tbsp", calories: 119, fat: 13.5 }, { name: "Ginger beef", calories: 400 }] });
r = await req("/api/recent");
ok("recents include real foods", r.b.items.some((i) => i.name === "Ginger beef"));
ok("recents skip the separate cooking-oil item", !r.b.items.some((i) => i.name === "Cooking oil"));
ok("favorite toggle on/off (case-insensitive)", (await post("/api/favorites", { item: { name: "Salmon", calories: 350 } })).b.on === true && (await post("/api/favorites", { item: { name: "salmon" } })).b.on === false);

section("WEIGHT · PROGRESS · EXPORT");
await post("/api/weight", { date: today, weight_kg: 79 });
ok("today's weigh-in updates profile weight", (await sql`SELECT weight_kg FROM profile`)[0].weight_kg === 79);
await post("/api/weight", { date: dayAgo(1), weight_kg: 81 });
ok("older weigh-in doesn't override it", (await sql`SELECT weight_kg FROM profile`)[0].weight_kg === 79);
for (const days of [7, 30, 90]) {
  const d = (await req(`/api/progress?days=${days}&today=${today}`)).b.days;
  ok(`progress ${days}d: ${days} rows ending on local today`, d.length === days && d.at(-1).date === today && new Set(d.map((x) => x.date)).size === days);
}
ok("progress axis across a month end", JSON.stringify((await req(`/api/progress?days=7&today=2026-03-02`)).b.days.map((x) => x.date).slice(-3)) === '["2026-02-28","2026-03-01","2026-03-02"]');
const ex = await fetch(U + "/api/export");
ok("CSV export", ex.status === 200 && (await ex.text()).includes("Salmon"));
ok("settings never return the full key", (await req("/api/settings")).s === 200);

// ---------------------------------------------------------------------------
section("AI PHOTO ANALYSIS (fake Gemini)");
await gemini.seen();
r = await post("/api/analyze", { image, mimeType: "image/jpeg" });
const sent = (await gemini.seen())[0];
ok("prompt asks for cooking fat as its own item", sent?.system.includes("COOKING FAT GOES IN ITS OWN ITEM"));
ok("schema has added_fat / cooked_meal / learned_preference", ["added_fat", "cooked_meal", "learned_preference"].every((k) => JSON.stringify(sent?.schema).includes(k)));
ok("answered by the configured model, not flagged lite", r.b.model === "gemini-2.5-flash" && r.b.lite === false, r.b);
ok("cooked meal flagged", r.b.cooked === true);
ok("cooking oil is one separate added_fat item", r.b.items.filter((i) => i.added_fat).length === 1 && r.b.items.find((i) => i.added_fat).name === "Cooking oil");
const egg = r.b.items.find((i) => i.name === "Fried egg");
ok("impossible calories → confidence capped + clarification", egg.confidence <= 0.6 && r.b.needs_clarification === true, egg);
ok("consistent items untouched", r.b.items.find((i) => i.name.includes("chicken")).confidence === 0.75);
const aiItems = r.b.items;

await gemini.mode("primary429");
r = await post("/api/analyze", { image, mimeType: "image/jpeg" });
const tried = (await gemini.seen()).map((s) => s.model);
ok(`quota on main model → tries full Flash before lite (${tried.join(" → ")})`, tried[0] === "gemini-2.5-flash" && tried[1] === "gemini-2.5-flash-lite");
ok("lite answer is labelled as a fallback", r.s === 200 && r.b.lite === true && r.b.model === "gemini-2.5-flash-lite", r.b);
await gemini.mode("ok");

section("AI LEARNING");
r = await post("/api/chat", { message: "add a banana", currentItems: aiItems, history: [] });
ok("ordinary chat ('add a banana') saves nothing", r.s === 200 && (await sql`SELECT count(*)::int c FROM corrections`)[0].c === 0);
ok("internal 'learned' field doesn't leak to the client", !("learned" in r.b));
await post("/api/chat", { message: "that's 1 cup of rice, not 1.5", currentItems: aiItems, history: [] });
await post("/api/chat", { message: "that's 1 cup of rice, not 1.5", currentItems: aiItems, history: [] });
let notes = (await sql`SELECT note FROM corrections`).map((x) => x.note);
ok("real correction saved once as a reusable rule", notes.length === 1 && notes[0] === "User's usual rice portion is 1 cup cooked, not 1.5", notes);
await gemini.seen();
await post("/api/analyze", { image, mimeType: "image/jpeg" });
ok("learned rule reaches the next analysis", (await gemini.seen())[0].system.includes("User's usual rice portion"));
r = await post("/api/log", { date: today, meal: "lunch", items: [aiItems[0]], learned: [{ food: "Rice", note: "Rice: user corrected 1.5 cups to 1 cup." }, { bogus: 1 }] });
ok("manual-edit corrections saved via /api/log (junk ignored)", r.s === 200 && (await sql`SELECT count(*)::int c FROM corrections`)[0].c === 2);

section("OTHER AI ROUTES");
r = await post("/api/suggest", { calories: 500, protein: 40, meal: "dinner" });
ok("meal suggestion", r.s === 200 && r.b.suggestion?.dish === "Chicken bowl", r.b);
for (const goal of ["maintain", "weird-value"]) {
  await sql`UPDATE profile SET goal_type = ${goal}`;
  r = await post("/api/ask", { message: "rice or potato?", history: [], date: today });
  ok(`Cut AI answers with goal=${goal}`, r.s === 200 && typeof r.b.text === "string", r.b);
}
await sql`UPDATE profile SET goal_type = 'cut'`;
if (NOKEY) {
  r = await post("/api/analyze", { image, mimeType: "image/jpeg" }, "POST", NOKEY);
  ok("no key linked → NO_KEY 'link your key', not 'daily limit'", r.s === 400 && r.b.code === "NO_KEY", r.b);
}

// ---------------------------------------------------------------------------
section("QUICK LOG (iOS Shortcuts API)");
ok("no token → 401", (await req("/api/quick?status=1")).s === 401);
const { token, last4 } = (await post("/api/quick/token", { timezone: TZ })).b;
ok("token created; only its SHA-256 stored", token?.length >= 30 && (await sql`SELECT token_hash FROM quick_tokens`)[0].token_hash === crypto.createHash("sha256").update(token).digest("hex"));
ok("status shows last4", (await req("/api/quick/token")).b.last4 === last4);
const Q = (qs) => req(`/api/quick?t=${token}&${qs}`);
await post("/api/favorites", { item: { name: "Greek Yogurt", quantity: "1 cup", calories: 130, protein: 23 }, on: true });
await post("/api/log", { date: dayAgo(1), meal: "snack", items: [{ name: "Mac & Cheese", quantity: "1 cup", calories: 450, protein: 18 }, { name: "Protein shake #2", calories: 160, protein: 30 }] });
r = await Q("list=1");
const list = String(r.b).split("\n");
ok("list: starred first, then recents", list[0] === "Greek Yogurt" && list.includes("Mac & Cheese"), r.b);
ok("list skips cooking oil", !list.includes("Cooking oil"));
const autoMeal = localMin < 660 ? "breakfast" : localMin < 960 ? "lunch" : localMin < 1260 ? "dinner" : "snack";
r = await Q(`food=${encodeURIComponent("mac & cheese")}`);
let last = (await sql`SELECT name, meal, log_date::text d, source FROM food_logs ORDER BY id DESC LIMIT 1`)[0];
ok(`food with '&' → logged to local date / ${autoMeal}`, r.s === 200 && last.name === "Mac & Cheese" && last.d === today && last.meal === autoMeal && last.source === "quick", { r: r.b, last });
r = await Q("food=shake&x=2&meal=breakfast");
last = (await sql`SELECT name, calories::int, meal FROM food_logs ORDER BY id DESC LIMIT 1`)[0];
ok("partial match + ×2 + meal override", last.name === "Protein shake #2" && last.calories === 320 && last.meal === "breakfast", last);
ok("POST JSON body (Shortcuts style)", (await req(`/api/quick?t=${token}`, { method: "POST", body: JSON.stringify({ food: "greek yogurt" }) })).b.startsWith("✓ Greek Yogurt"));
ok("Bearer auth", (await req("/api/quick?status=1", { headers: { Authorization: `Bearer ${token}` } })).s === 200);
ok("unknown food → 404; '%' is literal", (await Q("food=unicorn")).s === 404 && (await Q("food=%25")).s === 404);
r = await Q("weight=180,5");
const wToday = (await sql`SELECT weight_kg FROM weight_logs WHERE log_date = ${today}`)[0]?.weight_kg;
ok("weight with comma decimal → 180.5 lb (81.87 kg) on local date", r.b === "✓ Weight logged: 180.5 lb" && Math.abs(wToday - 81.874) < 0.01, { reply: r.b, wToday });
ok("silly weight → 400", (await Q("weight=5")).s === 400);
r = await Q(`say=${encodeURIComponent("two eggs and toast")}`);
ok("say → AI parses and logs both items", r.s === 200 && /^✓ 2 items, 262 kcal/.test(r.b), r.b);
const rot = (await post("/api/quick/token", { timezone: TZ })).b.token;
ok("rotate kills the old link", (await Q("status=1")).s === 401 && (await req(`/api/quick?t=${rot}&status=1`)).s === 200);
await post("/api/quick/token", {}, "DELETE");
ok("revoke kills the link", (await req(`/api/quick?t=${rot}&status=1`)).s === 401);

// ---------------------------------------------------------------------------
section("SMART REMINDERS (cron → real encrypted pushes)");
if (localMin < 150) {
  console.log("  (skipped: needs local time after 02:30 so 'N minutes ago' stays today)");
} else {
  await sql`DELETE FROM food_logs`; await sql`DELETE FROM weight_logs`;
  const { cronSecret } = (await req("/api/push")).b;
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { endpoint: `${PUSH}/me`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };
  const got = async (p = "/me", key = ecdh, a = auth) => (await (await fetch(PUSH + "/__got")).json()).filter((g) => g.url === p).map((g) => JSON.parse(ece.decrypt(Buffer.from(g.body, "base64"), { version: "aes128gcm", privateKey: key, authSecret: a }).toString()));
  const clear = () => fetch(PUSH + "/__got", { method: "DELETE" });
  const cron = async () => (await req("/api/cron/reminders", { headers: { "x-cron-key": cronSecret } })).b;
  ok("cron without key → 401", (await req("/api/cron/reminders")).s === 401);

  for (const n of [1, 2, 3]) await post("/api/log", { date: dayAgo(n), meal: "lunch", items: [{ name: "Rice", calories: 300 }] });
  await post("/api/log", { date: today, meal: "lunch", items: [{ name: "Chicken bowl", calories: 600 }] });
  await post("/api/weight", { date: today, weight_kg: 80 });
  const times = { breakfast: ago(40), lunch: ago(30), dinner: ago(1), weight: ago(20), recap: ago(1) };
  await post("/api/push", { subscription: sub, timezone: TZ, reminders: { enabled: true, times } });
  await clear();
  r = await cron();
  ok("sends breakfast/dinner/check-in, skips logged lunch + done weigh-in", r.sent === 3 && r.skipped === 2, r);
  const msgs = await got();
  const by = Object.fromEntries(msgs.map((m) => [m.notification.navigate.replace(U, ""), m.notification]));
  ok("declarative payloads (web_push 8030)", msgs.length === 3 && msgs.every((m) => m.web_push === 8030));
  ok("taps deep-link to /add?meal=…", !!by["/add?meal=breakfast"] && !!by["/add?meal=dinner"]);
  ok("streak in meal copy (4 days)", by["/add?meal=dinner"]?.body.includes("🔥 4-day streak"), by["/add?meal=dinner"]);
  ok("check-in lists what's missing + kcal left", by["/"]?.body === `Breakfast & dinner not logged yet · ${(target - 600).toLocaleString("en-US")} kcal left`, by["/"]);
  ok("badge = 2 unlogged meals", msgs.every((m) => m.notification.app_badge === "2"));
  ok("next tick sends nothing new", (await cron()).sent === 0);
  await post("/api/log", { date: today, meal: "dinner", items: [{ name: "Salmon", calories: 400 }] });
  await sql`UPDATE push_subs SET last_sent = '{}'`; await clear();
  await cron();
  const m2 = await got();
  ok("after dinner logged: check-in points at /add?meal=breakfast, badge 1", m2.some((m) => m.notification.navigate === `${U}/add?meal=breakfast`) && m2.every((m) => m.notification.app_badge === "1"), m2.map((m) => m.notification));
  await post("/api/push", { subscription: sub, timezone: TZ, cronTest: true, reminders: { enabled: true, times: { ...times, test: ago(1) } } });
  await cron();
  ok("test reminder is one-shot", !("test" in (await sql`SELECT reminders FROM push_subs`)[0].reminders.times));
  await sql`UPDATE push_subs SET endpoint = ${PUSH + "/gone"}, last_sent = '{}', reminders = ${sql.json({ enabled: true, times: { dinner: ago(1) } })}`;
  await sql`DELETE FROM food_logs WHERE meal = 'dinner'`;
  ok("410 from push service → subscription pruned", (await cron()).pruned === 1);

  section("MATCH MY HABITS");
  await sql`DELETE FROM food_logs`;
  const at = (d, t) => new Date(`${d}T${t}:00-07:00`);
  for (const [d, t] of [[dayAgo(1), "12:10"], [dayAgo(2), "12:30"], [dayAgo(3), "12:20"]]) await sql`INSERT INTO food_logs (user_id, log_date, name, meal, created_at) VALUES ('me', ${d}, 'x', 'lunch', ${at(d, t)})`;
  await sql`INSERT INTO food_logs (user_id, log_date, name, meal, created_at) VALUES ('me', ${dayAgo(3)}, 'z', 'dinner', now())`;
  r = await req(`/api/habits?tz=${encodeURIComponent(TZ)}`);
  ok("lunch → 12:40 (median + 20); back-fills ignored", r.b.times?.lunch === "12:40" && !r.b.times?.dinner, r.b);
  ok("bad timezone → 400", (await req("/api/habits?tz=Mars/Base")).s === 400);
}

// ---------------------------------------------------------------------------
section("SIGNED SHORTCUT FILES (macOS only: aea/aa)");
let haveAea = false;
try { execFileSync("which", ["aea"]); haveAea = true; } catch { /* not macOS */ }
if (!haveAea) console.log("  (skipped: needs macOS aea)");
else {
  await sql`TRUNCATE food_logs, favorites`;
  await post("/api/log", { date: today, meal: "lunch", items: [{ name: "Café latte", calories: 190, protein: 10 }] });
  const t = (await post("/api/quick/token", { timezone: TZ })).b.token;
  const base = `${U}/api/quick?t=${t}`;
  const run = (spec) => JSON.parse(execFileSync("python3", [new URL("./run-shortcut.py", import.meta.url).pathname, JSON.stringify(spec)]).toString());
  for (const f of ["log-food", "tell-cut", "log-weight", "whats-left", "log-favorite"]) ok(`${f}.shortcut is present`, fs.existsSync(`public/shortcuts/${f}.shortcut`));
  ok("Log Food: pick from list → logged", run({ path: "public/shortcuts/log-food.shortcut", answers: [base], choose: "Café latte" })[0].startsWith("✓ Café latte"));
  ok("Log Favorite: 2 import questions land on separate actions", run({ path: "public/shortcuts/log-favorite.shortcut", answers: [base, "café latte"] })[0].startsWith("✓ Café latte"));
  ok("Log Weight: '181,4'", run({ path: "public/shortcuts/log-weight.shortcut", answers: [base], ask: "181,4" })[0] === "✓ Weight logged: 181.4 lb");
  ok("What's Left", /kcal/.test(run({ path: "public/shortcuts/whats-left.shortcut", answers: [base] })[0]));
  ok("Tell Cut", run({ path: "public/shortcuts/tell-cut.shortcut", answers: [base], dictate: "two eggs and toast" })[0].startsWith("✓ 2 items"));
  ok("wrong link → readable notification", run({ path: "public/shortcuts/whats-left.shortcut", answers: [`${U}/api/quick?t=nope-nope-nope-nope-nope`] })[0].startsWith("Quick-log link isn't valid"));
}

console.log(`\n${pass} passed, ${fail} failed`);
await sql.end();
process.exit(fail ? 1 : 0);
