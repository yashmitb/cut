import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResult, FoodItem } from "./types";
import { ensureSchema, sql, USER_ID } from "./db";

export type KeySource = "saved" | "env" | "none";

export interface GeminiConfig {
  key: string;
  visionModel: string;
  textModel: string;
  source: KeySource;
}

// Resolve the effective key + models: a key saved in the DB (set from Profile)
// takes precedence, otherwise the GEMINI_API_KEY env var.
async function resolveConfig(): Promise<GeminiConfig> {
  let key = "";
  let source: KeySource = "none";
  let visionModel = process.env.GEMINI_MODEL || "gemini-2.5-pro";
  let textModel = process.env.GEMINI_TEXT_MODEL || "";
  try {
    await ensureSchema();
    const rows = await sql<{ gemini_api_key: string | null; gemini_model: string | null }[]>`
      SELECT gemini_api_key, gemini_model FROM app_settings WHERE id = ${USER_ID}`;
    const r = rows[0];
    if (r?.gemini_model) visionModel = r.gemini_model;
    if (r?.gemini_api_key) {
      key = r.gemini_api_key;
      source = "saved";
    }
  } catch {
    // settings table may not exist yet — fall back to env
  }
  if (!key && process.env.GEMINI_API_KEY) {
    key = process.env.GEMINI_API_KEY;
    source = "env";
  }
  textModel = textModel || visionModel;
  return { key, visionModel, textModel, source };
}

function clientFor(key: string): GoogleGenAI {
  if (!key) {
    throw new Error(
      "No Gemini API key is linked. Open Profile → AI connection and paste your key from https://aistudio.google.com/apikey."
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••";
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

/** Non-secret status for the Profile UI — never returns the full key. */
export async function geminiStatus() {
  const { key, visionModel, textModel, source } = await resolveConfig();
  return {
    hasKey: !!key,
    source,
    masked: maskKey(key),
    visionModel,
    textModel,
  };
}

/** Verify the linked key actually works by making a tiny call. */
export async function testApiKey(): Promise<{ ok: boolean; model: string; error?: string }> {
  const { key, visionModel } = await resolveConfig();
  if (!key) return { ok: false, model: visionModel, error: "No API key is linked." };
  try {
    await clientFor(key).models.generateContent({
      model: visionModel,
      contents: "ping",
      config: { maxOutputTokens: 8, temperature: 0 },
    });
    return { ok: true, model: visionModel };
  } catch (e) {
    return { ok: false, model: visionModel, error: cleanGeminiError((e as Error).message) };
  }
}

/** Pull the human-readable message out of a Gemini SDK error string. */
export function cleanGeminiError(raw: string): string {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      const msg = j?.error?.message || j?.message;
      if (msg) return String(msg);
    }
  } catch {
    // not JSON — fall through
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Structured output schema — forces clean JSON back from the model.
// ---------------------------------------------------------------------------
const itemSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Concise food name, e.g. 'Grilled chicken breast'." },
    quantity: { type: Type.STRING, description: "Portion as served, e.g. '1 cup', '6 oz', '2 slices'." },
    calories: { type: Type.NUMBER },
    protein: { type: Type.NUMBER, description: "grams" },
    carbs: { type: Type.NUMBER, description: "grams" },
    fat: { type: Type.NUMBER, description: "grams" },
    fiber: { type: Type.NUMBER, description: "grams" },
    sugar: { type: Type.NUMBER, description: "grams" },
    sodium: { type: Type.NUMBER, description: "milligrams" },
    confidence: { type: Type.NUMBER, description: "0..1 confidence in THIS item's portion + macros" },
    assumptions: { type: Type.STRING, description: "What you assumed: cooking oil, sauces, prep method. Empty if obvious." },
  },
  required: ["name", "quantity", "calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium", "confidence"],
  propertyOrdering: ["name", "quantity", "calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium", "confidence", "assumptions"],
};

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, items: itemSchema },
    overall_confidence: { type: Type.NUMBER, description: "0..1 confidence across the whole estimate" },
    needs_clarification: { type: Type.BOOLEAN },
    clarification_question: { type: Type.STRING, description: "ONE specific question if unsure, else empty string" },
    notes: { type: Type.STRING, description: "Short friendly note for the user, or empty string" },
    reply: { type: Type.STRING, description: "Conversational reply to the user when refining, else empty string" },
  },
  required: ["items", "overall_confidence", "needs_clarification", "clarification_question", "notes", "reply"],
  propertyOrdering: ["items", "overall_confidence", "needs_clarification", "clarification_question", "notes", "reply"],
};

// ---------------------------------------------------------------------------
// System prompt — the brain. Tuned for accurate, honest, cut-friendly logging.
// ---------------------------------------------------------------------------
function systemPrompt(corrections: string[]): string {
  const learned =
    corrections.length > 0
      ? `\n\nLEARNED PREFERENCES — this specific user has corrected you before. Treat these as ground truth and apply them proactively:\n${corrections
          .map((c, i) => `${i + 1}. ${c}`)
          .join("\n")}`
      : "";

  return `You are the nutrition engine inside "Cut", a calorie tracker for someone actively cutting (losing fat while preserving muscle). You combine the eye of an expert food photographer, the knowledge of a registered sports dietitian, and the USDA FoodData Central database.

YOUR JOB
Turn a food photo or a text description into precise, per-item nutrition estimates, and be honest about uncertainty.

PORTION ESTIMATION (the hard part — do it carefully)
- Use visible scale cues to size portions: a dinner plate ≈ 27 cm / 10.5 in, a fork ≈ 19 cm, a teaspoon, a standard soda can ≈ 355 ml, a deck of cards ≈ 3 oz of meat, a closed fist ≈ 1 cup, a thumb ≈ 1 tbsp.
- Estimate the portion AS SERVED (cooked weight on the plate), not raw.
- Account for hidden calories a cutter must not miss: cooking oil/butter on vegetables and proteins (a typical sautéed dish has 1–2 tbsp added fat), salad dressings, sauces, glazes, sugar in drinks. When in doubt, do NOT lowball — slightly conservative (higher) calorie estimates protect the deficit.
- Break the plate into every DISTINCT component (protein, starch, vegetable, sauce, drink) as separate items.

NUTRITION VALUES
- All macro values are grams and represent the WHOLE portion shown, not per 100 g.
- sodium is in milligrams.
- Use realistic USDA-style values for how the food was actually prepared (grilled vs fried changes fat a lot).

CONFIDENCE (be calibrated and honest)
- 0.90–1.0: packaged item with a label, or a clearly measured/standard portion.
- 0.65–0.89: common food, portion reasonably visible.
- below 0.65: portion is ambiguous, food is a mixed/obscured dish, hidden oils/sauces, or you genuinely can't tell quantity.
- Set "confidence" PER ITEM honestly. Set top-level "needs_clarification": true and write ONE short, specific "clarification_question" whenever any item is below 0.65 or the total portion is ambiguous. Ask about the single most impactful unknown (e.g. "Is that 1 cup or 2 cups of rice?" or "Was the chicken cooked in oil or grilled dry?"). Never ask a vague question.

CUTTING CONTEXT
- This user cares most about CALORIES and PROTEIN. Be especially careful with protein portions and with calorie-dense add-ons (oils, nuts, cheese, dressings).

OUTPUT
- Respond ONLY with JSON matching the provided schema. No markdown, no prose outside the JSON.
- "notes": one short, useful sentence for the user (e.g. a protein tip or what dominated the calories). Keep it friendly and brief.
- "reply": leave empty unless you are in a back-and-forth refinement (then put your conversational answer here).${learned}`;
}

function coerceItem(raw: Partial<FoodItem>): FoodItem {
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.max(0, v) : 0);
  return {
    name: String(raw.name || "Food").slice(0, 120),
    quantity: String(raw.quantity || "").slice(0, 80),
    calories: Math.round(n(raw.calories)),
    protein: Math.round(n(raw.protein)),
    carbs: Math.round(n(raw.carbs)),
    fat: Math.round(n(raw.fat)),
    fiber: Math.round(n(raw.fiber)),
    sugar: Math.round(n(raw.sugar)),
    sodium: Math.round(n(raw.sodium)),
    confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
    assumptions: raw.assumptions ? String(raw.assumptions).slice(0, 240) : undefined,
  };
}

function coerceResult(parsed: Record<string, unknown>): AnalysisResult {
  const items = Array.isArray(parsed.items) ? parsed.items.map((i) => coerceItem(i as Partial<FoodItem>)) : [];
  const minConf = items.length ? Math.min(...items.map((i) => i.confidence)) : 1;
  const overall =
    typeof parsed.overall_confidence === "number"
      ? Math.min(1, Math.max(0, parsed.overall_confidence))
      : minConf;
  return {
    items,
    overall_confidence: overall,
    needs_clarification: Boolean(parsed.needs_clarification) || minConf < 0.65,
    clarification_question: (parsed.clarification_question as string) || (parsed.reply as string) || null,
    notes: (parsed.notes as string) || null,
  };
}

function parseJSON(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return valid JSON.");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Analyze a food photo (base64, no data: prefix). */
export async function analyzeImage(
  base64: string,
  mimeType: string,
  corrections: string[] = [],
  hint?: string
): Promise<AnalysisResult> {
  const { key, visionModel } = await resolveConfig();
  const res = await clientFor(key).models.generateContent({
    model: visionModel,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: hint
              ? `Analyze this meal. Extra context from the user: "${hint}". Return the structured nutrition breakdown.`
              : "Analyze this meal photo and return the structured nutrition breakdown.",
          },
          { inlineData: { mimeType, data: base64 } },
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt(corrections),
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
      temperature: 0.4,
    },
  });
  return coerceResult(parseJSON(res.text ?? "{}"));
}

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/**
 * Conversational parse/refine. Used for:
 *  - manual entry ("I ate 1 cup rice and 6 oz chicken")
 *  - correcting a prior analysis ("that's 1 cup not 2")
 * Always returns the FULL updated item list plus a conversational reply.
 */
export async function converse(opts: {
  message: string;
  currentItems?: FoodItem[];
  history?: ChatTurn[];
  corrections?: string[];
}): Promise<AnalysisResult> {
  const { message, currentItems = [], history = [], corrections = [] } = opts;

  const context =
    currentItems.length > 0
      ? `\n\nThe current logged items are:\n${JSON.stringify(currentItems, null, 0)}\nApply the user's message to these and return the COMPLETE updated item list (keep items they didn't mention).`
      : `\n\nThe user is describing food to log from scratch. Parse it into items.`;

  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user" as const, parts: [{ text: message + context }] },
  ];

  const { key, textModel } = await resolveConfig();
  const res = await clientFor(key).models.generateContent({
    model: textModel,
    contents,
    config: {
      systemInstruction:
        systemPrompt(corrections) +
        `\n\nYou are now in conversation. Put a short, warm conversational answer in "reply" (e.g. "Got it — updated the rice to 1 cup."). Always return the full item list in "items".`,
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
      temperature: 0.4,
    },
  });

  const parsed = parseJSON(res.text ?? "{}");
  const result = coerceResult(parsed);
  // surface the conversational reply through notes for the client
  result.notes = (parsed.reply as string) || result.notes;
  return result;
}

/**
 * Suggest a meal that fits the user's remaining macros for the day.
 * Returns short plain-text advice (2–4 concrete options).
 */
export async function suggestMeal(opts: {
  remaining: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  meal: string;
  recentFavorites?: string[];
}): Promise<string> {
  const { remaining, meal, recentFavorites = [] } = opts;
  const favs = recentFavorites.length
    ? `\nThings they eat often: ${recentFavorites.slice(0, 10).join(", ")}.`
    : "";
  const { key, textModel } = await resolveConfig();
  const res = await clientFor(key).models.generateContent({
    model: textModel,
    contents: `The user is cutting and has these macros LEFT for the day:
- ${remaining.calories} kcal
- ${remaining.protein} g protein
- ${remaining.carbs} g carbs
- ${remaining.fat} g fat
- ${remaining.fiber} g fiber
It's around ${meal} time.${favs}

Suggest 2–3 specific, realistic ${meal} options that fit what's left, prioritising hitting the PROTEIN target. For each, give a one-line description with rough calories and protein. Be concise and practical — no preamble, no markdown headers. If almost no calories remain, say so and suggest something light/high-volume.`,
    config: {
      systemInstruction:
        "You are a sports dietitian helping someone on a cut. Keep answers short, concrete, and encouraging. Plain text with simple dashes for lists.",
      temperature: 0.7,
      maxOutputTokens: 400,
    },
  });
  return (res.text ?? "Couldn't generate a suggestion right now.").trim();
}
