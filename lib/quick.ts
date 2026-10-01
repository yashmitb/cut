import { createHash, randomBytes } from "node:crypto";
import { sql } from "./db";

// Personal quick-log tokens: the raw token only ever lives in the user's
// Shortcuts / browser; the DB keeps its SHA-256 hash.
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function validTimezone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export async function userForToken(token: string): Promise<{ user_id: string; timezone: string } | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const rows = await sql<{ user_id: string; timezone: string }[]>`
    UPDATE quick_tokens SET last_used_at = now()
    WHERE token_hash = ${hashToken(token)}
    RETURNING user_id, timezone`;
  return rows[0] ?? null;
}
