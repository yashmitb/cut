// Stand-ins for the outside services the e2e suite needs:
//  • Gemini (HTTP :4600) — point the app at it with GOOGLE_GEMINI_BASE_URL.
//    POST /__mode "ok" | "primary429" (non-lite models answer 429), GET /__seen.
//  • Web Push endpoint (HTTPS :4555, self-signed) — records encrypted pushes.
//    GET /__got, DELETE /__got. Paths containing "gone" answer 410.
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const dir = process.argv[2]; // holds key.pem / cert.pem made by run.sh

// ---- Gemini ---------------------------------------------------------------
let mode = "ok";
const seen = [];
const item = (o) => ({ quantity: "", protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, confidence: 0.85, assumptions: "", added_fat: false, ...o });
const photo = {
  items: [
    item({ name: "Steamed jasmine rice", quantity: "1.5 cups", calories: 310, protein: 6, carbs: 68, fat: 1, fiber: 1, confidence: 0.8 }),
    item({ name: "Thai basil minced chicken", quantity: "5 oz", calories: 260, protein: 34, carbs: 6, fat: 11, fiber: 1, confidence: 0.75, assumptions: "Lean ground chicken" }),
    item({ name: "Fried egg", quantity: "1 large", calories: 300, protein: 6, carbs: 1, fat: 7, confidence: 0.9 }), // impossible calories
    item({ name: "Cooking oil", quantity: "1.5 tbsp", calories: 179, fat: 20, confidence: 0.5, added_fat: true }),
  ],
  overall_confidence: 0.75, needs_clarification: false, clarification_question: "", notes: "Protein is solid.", reply: "", cooked_meal: true, learned_preference: "",
};
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url === "/__mode") { mode = body; return res.end("ok"); }
    if (req.url === "/__seen") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(seen)); seen.length = 0; return; }
    const model = (req.url.match(/models\/([^:]+):/) || [])[1];
    const j = JSON.parse(body || "{}");
    const txt = JSON.stringify(j.contents || "");
    seen.push({ model, system: j.systemInstruction?.parts?.[0]?.text || "", schema: j.generationConfig?.responseSchema || null, text: txt.slice(0, 600) });
    if (mode === "primary429" && !/lite/.test(model)) {
      res.statusCode = 429;
      return res.end(JSON.stringify({ error: { code: 429, message: "Resource has been exhausted (e.g. check quota).", status: "RESOURCE_EXHAUSTED" } }));
    }
    let out = photo;
    if (txt.includes("that's 1 cup of rice")) out = { ...photo, items: photo.items.map((i) => (i.name.includes("rice") ? { ...i, quantity: "1 cup", calories: 205, carbs: 45, protein: 4 } : i)), reply: "Updated the rice to 1 cup.", learned_preference: "User's usual rice portion is 1 cup cooked, not 1.5" };
    else if (txt.includes("add a banana")) out = { ...photo, items: [...photo.items, item({ name: "Banana", quantity: "1 medium", calories: 105, protein: 1, carbs: 27, fiber: 3 })], reply: "Added a banana." };
    else if (txt.includes("two eggs and toast")) out = { ...photo, items: [item({ name: "Scrambled eggs", quantity: "2 large", calories: 182, protein: 12, carbs: 2, fat: 14 }), item({ name: "Toast", quantity: "1 slice", calories: 80, protein: 3, carbs: 14, fat: 1, fiber: 1 })], cooked_meal: false };
    else if (j.generationConfig?.responseSchema?.properties?.dish) out = { dish: "Chicken bowl", blurb: "Fits.", calories: 450, protein: 40, carbs: 40, fat: 12, fiber: 6, ingredients: ["chicken"], steps: ["cook"] };
    else if (!j.generationConfig?.responseSchema) out = "Pick the chicken — more protein per calorie.";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: typeof out === "string" ? out : JSON.stringify(out) }] }, finishReason: "STOP" }], modelVersion: model }));
  });
}).listen(4600);

// ---- Web Push endpoint ----------------------------------------------------
const got = [];
https.createServer({ key: fs.readFileSync(path.join(dir, "key.pem")), cert: fs.readFileSync(path.join(dir, "cert.pem")) }, (req, res) => {
  if (req.method === "GET" && req.url === "/__got") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(got)); }
  if (req.method === "DELETE" && req.url === "/__got") { got.length = 0; res.writeHead(204); return res.end(); }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    got.push({ url: req.url, body: Buffer.concat(chunks).toString("base64") });
    res.writeHead(req.url.includes("gone") ? 410 : 201);
    res.end();
  });
}).listen(4555, () => console.log("fakes up: gemini :4600, push :4555"));
