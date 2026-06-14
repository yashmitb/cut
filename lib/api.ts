// Tiny client-side fetch helpers.
import type { Profile, FoodLog, WeightLog, FoodItem, AnalysisResult, MealType, DayTotals } from "./types";

const baseUrl = typeof window !== "undefined"
  ? ""
  : (process.env.NEXT_PUBLIC_BASE_URL || "https://cut-eta.vercel.app");

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

async function j<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  getProfile: () => apiFetch("/api/profile").then((r) => j<{ profile: Profile | null }>(r)),
  saveProfile: (body: unknown) =>
    apiFetch("/api/profile", { method: "POST", body: JSON.stringify(body) }).then((r) =>
      j<{ profile: Profile }>(r)
    ),

  getDay: (date: string) =>
    apiFetch(`/api/log?date=${date}`).then((r) => j<{ items: FoodLog[] }>(r)),
  addItems: (date: string, items: FoodItem[], source: string, meal: MealType) =>
    apiFetch("/api/log", { method: "POST", body: JSON.stringify({ date, items, source, meal }) }).then((r) =>
      j<{ items: FoodLog[] }>(r)
    ),
  editItem: (body: unknown) =>
    apiFetch("/api/log", { method: "PATCH", body: JSON.stringify(body) }).then((r) =>
      j<{ items: FoodLog[] }>(r)
    ),
  deleteItem: (id: number, date: string) =>
    apiFetch(`/api/log?id=${id}&date=${date}`, { method: "DELETE" }).then((r) =>
      j<{ items: FoodLog[] }>(r)
    ),

  analyze: (image: string, mimeType: string, hint?: string) =>
    apiFetch("/api/analyze", { method: "POST", body: JSON.stringify({ image, mimeType, hint }) }).then(
      (r) => j<AnalysisResult>(r)
    ),
  chat: (message: string, currentItems: FoodItem[], history: { role: "user" | "model"; text: string }[]) =>
    apiFetch("/api/chat", { method: "POST", body: JSON.stringify({ message, currentItems, history }) }).then(
      (r) => j<AnalysisResult>(r)
    ),

  getRecent: () => apiFetch("/api/recent").then((r) => j<{ items: FoodItem[] }>(r)),
  suggest: (remaining: DayTotals, meal: MealType) =>
    apiFetch("/api/suggest", { method: "POST", body: JSON.stringify({ ...remaining, meal }) }).then((r) =>
      j<{ text: string }>(r)
    ),

  getWater: (date: string) => apiFetch(`/api/water?date=${date}`).then((r) => j<{ ml: number }>(r)),
  addWater: (date: string, delta: number) =>
    apiFetch("/api/water", { method: "POST", body: JSON.stringify({ date, delta }) }).then((r) =>
      j<{ ml: number }>(r)
    ),

  getSettings: () =>
    apiFetch("/api/settings").then((r) =>
      j<{ hasKey: boolean; source: "saved" | "env" | "none"; masked: string; visionModel: string; textModel: string }>(r)
    ),
  saveSettings: (body: { gemini_api_key?: string; gemini_model?: string }) =>
    apiFetch("/api/settings", { method: "POST", body: JSON.stringify(body) }).then((r) =>
      j<{ hasKey: boolean; source: "saved" | "env" | "none"; masked: string; visionModel: string; textModel: string }>(r)
    ),
  testSettings: () =>
    apiFetch("/api/settings", { method: "POST", body: JSON.stringify({ action: "test" }) }).then((r) =>
      j<{ ok: boolean; model: string; error?: string }>(r)
    ),

  getWeights: () => apiFetch("/api/weight").then((r) => j<{ weights: WeightLog[] }>(r)),
  addWeight: (date: string, weight_kg: number) =>
    apiFetch("/api/weight", { method: "POST", body: JSON.stringify({ date, weight_kg }) }).then((r) =>
      j<{ weights: WeightLog[] }>(r)
    ),

  getProgress: (days: number) =>
    apiFetch(`/api/progress?days=${days}`).then((r) =>
      j<{ days: import("@/app/api/progress/route").DayRow[] }>(r)
    ),
};
