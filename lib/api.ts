// Client-side fetch helpers. Every call auto-retries transient failures with a
// visible countdown (see lib/retry) instead of surfacing a raw error.
import type { Profile, FoodLog, WeightLog, FoodItem, Favorite, AnalysisResult, MealType, DayTotals, MealSuggestion } from "./types";
import { ApiError, withRetry } from "./retry";
import { todayLocal } from "./nutrition";

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
  // `date` is the user's local day — the server's clock is UTC
  saveProfile: (body: object) =>
    call<{ profile: Profile }>("Saving profile", "/api/profile", post({ ...body, date: todayLocal() })),

  getToday: (date: string) =>
    call<{ profile: Profile | null; items: FoodLog[] }>("Loading your day", `/api/today?date=${date}`),
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

  getRecent: () =>
    call<{
      items: (FoodItem & { count?: number; fav?: boolean })[];
      combos: { group_label: string; calories: number; items: FoodItem[] }[];
      favorites: Favorite[];
    }>("Loading recents", "/api/recent"),
  toggleFavorite: (item: FoodItem, on?: boolean) =>
    call<{ favorites: Favorite[]; on: boolean }>("Updating favorites", "/api/favorites", post({ item, on })),
  copyDay: (from: string, to: string, meal?: MealType) =>
    call<{ items: FoodLog[]; copied: number }>("Copying day", "/api/copy", post({ from, to, meal })),
  suggest: (remaining: DayTotals, meal: MealType, craving: string) =>
    call<{ suggestion: MealSuggestion }>("Cooking up an idea", "/api/suggest", post({ ...remaining, meal, craving })),

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
    call<{ days: import("@/app/api/progress/route").DayRow[] }>("Loading progress", `/api/progress?days=${days}&today=${todayLocal()}`),

  getQuickToken: (tz: string) =>
    call<{ enabled: boolean; last4?: string; created_at?: string; last_used_at?: string | null }>(
      "Loading quick log",
      `/api/quick/token?tz=${encodeURIComponent(tz)}`
    ),
  createQuickToken: (timezone: string) =>
    call<{ token: string; last4: string }>("Creating your link", "/api/quick/token", post({ timezone })),
  revokeQuickToken: () => call<{ ok: boolean }>("Turning off quick log", "/api/quick/token", { method: "DELETE" }),

  getHabits: (tz: string) =>
    call<{ times: Record<string, string>; counts: Record<string, number> }>("Reading your habits", `/api/habits?tz=${encodeURIComponent(tz)}`),

  getPush: () =>
    call<{ vapidPublicKey: string; cronSecret: string | null; cronUrl: string | null; subscriptions: number }>("Loading push", "/api/push"),
  savePush: (body: { subscription: PushSubscriptionJSON; reminders: unknown; timezone: string; cronTest?: boolean }) =>
    call<{ ok: boolean; cronTest?: boolean }>("Saving reminders", "/api/push", post(body)),
  deletePush: (endpoint?: string) =>
    call<{ ok: boolean }>("Turning off reminders", `/api/push${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`, { method: "DELETE" }),
};
