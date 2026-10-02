import { sql } from "./db";

// Learned corrections are fed back into future AI prompts (see systemPrompt in
// lib/gemini). Keep them meaningful: reusable rules and real user edits only.

/** Store a learned rule, skipping exact repeats of one we already have. */
export async function saveCorrection(userId: string, food: string, note: string) {
  const n = note.trim().slice(0, 280);
  if (!n) return;
  await sql`
    INSERT INTO corrections (user_id, food, note)
    SELECT ${userId}, ${food.slice(0, 120)}, ${n}
    WHERE NOT EXISTS (SELECT 1 FROM corrections WHERE user_id = ${userId} AND lower(note) = lower(${n}))`;
}

export async function recentCorrections(userId: string): Promise<string[]> {
  const rows = await sql<{ note: string }[]>`
    SELECT note FROM corrections WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 15`;
  return rows.map((r) => r.note);
}
