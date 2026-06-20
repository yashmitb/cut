// Client-side fetch helpers. Every call auto-retries transient failures with a
// visible countdown (see lib/retry) instead of surfacing a raw error.
import type { Profile, FoodLog, WeightLog, FoodItem, AnalysisResult, MealType, DayTotals, MealSuggestion } from "./types";
import { ApiError, withRetry } from "./retry";

const baseUrl = typeof window !== "undefined"
  ? ""
  : (process.env.NEXT_PUBLIC_BASE_URL || "https://cut-eta.vercel.app");

/** Fetch + parse + retry. `label` shows in the countdown ("Retrying in 3…"). */
function call<T>(label: string, path: string, init?: RequestInit): Promise<T> {
  return withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, init);
    } catch {
      // network failure — let retry handle it
      throw new ApiError("Network error", 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const d = data as { error?: string; code?: string };
      throw new ApiError(d.error || `Request failed (${res.status})`, res.status, d.code);
    }
    return data as T;
  }, label);
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  getProfile: () => call<{ profile: Profile | null }>("Loading profile", "/api/profile"),
  saveProfile: (body: unknown) => call<{ profile: Profile }>("Saving profile", "/api/profile", post(body)),

  getToday: (date: string) =>
    call<{ profile: Profile | null; items: FoodLog[]; water: number }>("Loading your day", `/api/today?date=${date}`),
  getDay: (date: string) => call<{ items: FoodLog[] }>("Loading your day", `/api/log?date=${date}`),
  addItems: (
    date: string,
    items: FoodItem[],
    source: string,
    meal: MealType,
    group?: { group_id: string; group_label: string }
  ) => call<{ items: FoodLog[] }>("Logging food", "/api/log", post({ date, items, source, meal, ...(group || {}) })),
  editItem: (body: unknown) => call<{ items: FoodLog[] }>("Saving changes", "/api/log", { method: "PATCH", body: JSON.stringify(body) }),
  moveGroup: (group_id: string, patch: { meal?: MealType; group_label?: string }) =>
    call<{ items: FoodLog[] }>("Updating group", "/api/log", { method: "PATCH", body: JSON.stringify({ group_id, ...patch }) }),
  deleteItem: (id: number, date: string) =>
    call<{ items: FoodLog[] }>("Removing item", `/api/log?id=${id}&date=${date}`, { method: "DELETE" }),
  deleteGroup: (group_id: string, date: string) =>
    call<{ items: FoodLog[] }>("Removing group", `/api/log?group=${group_id}&date=${date}`, { method: "DELETE" }),

  analyze: (image: string, mimeType: string, hint?: string) =>
    call<AnalysisResult>("Analyzing your photo", "/api/analyze", post({ image, mimeType, hint })),
  chat: (message: string, currentItems: FoodItem[], history: { role: "user" | "model"; text: string }[]) =>
    call<AnalysisResult>("Asking the coach", "/api/chat", post({ message, currentItems, history })),

  ask: (message: string, history: { role: "user" | "model"; text: string }[], date: string) =>
    call<{ text: string }>("Thinking", "/api/ask", post({ message, history, date })),

  getRecent: () => call<{ items: (FoodItem & { count?: number })[] }>("Loading recents", "/api/recent"),
  suggest: (remaining: DayTotals, meal: MealType, craving: string) =>
    call<{ suggestion: MealSuggestion }>("Cooking up an idea", "/api/suggest", post({ ...remaining, meal, craving })),

  getWater: (date: string) => call<{ ml: number }>("Loading water", `/api/water?date=${date}`),
  addWater: (date: string, delta: number) => call<{ ml: number }>("Updating water", "/api/water", post({ date, delta })),

  getSettings: () =>
    call<{ hasKey: boolean; source: "saved" | "env" | "none"; masked: string; visionModel: string; textModel: string }>(
      "Loading settings",
      "/api/settings"
    ),
  saveSettings: (body: { gemini_api_key?: string; gemini_model?: string }) =>
    call<{ hasKey: boolean; source: "saved" | "env" | "none"; masked: string; visionModel: string; textModel: string }>(
      "Saving settings",
      "/api/settings",
      post(body)
    ),
  testSettings: () =>
    call<{ ok: boolean; model: string; error?: string }>("Testing connection", "/api/settings", post({ action: "test" })),

  getWeights: () => call<{ weights: WeightLog[] }>("Loading weights", "/api/weight"),
  addWeight: (date: string, weight_kg: number) =>
    call<{ weights: WeightLog[] }>("Saving weight", "/api/weight", post({ date, weight_kg })),

  getProgress: (days: number) =>
    call<{ days: import("@/app/api/progress/route").DayRow[] }>("Loading progress", `/api/progress?days=${days}`),
};
