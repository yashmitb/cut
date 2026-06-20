import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { USER_ID } from "@/lib/db";
import { SUPABASE_CONFIGURED } from "./env";
import { createSupabaseServer } from "./server";

// Legacy HS256 signing secret (present on most Supabase projects). When set, we
// verify the access token's signature locally with `jose` — no network round
// trip to the Auth server on every request. Falls back to a network getUser().
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
const secretKey = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : null;

/**
 * The id that scopes all data for the current request.
 * - With Supabase: the authenticated user's id, or null if signed out.
 * - Without Supabase (local dev): a fixed single-user id so the app still works.
 */
export async function getUserId(): Promise<string | null> {
  if (!SUPABASE_CONFIGURED) return USER_ID;
  try {
    const supabase = await createSupabaseServer();

    // Fast path: read the token from cookies (no network) and verify locally.
    if (secretKey) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        try {
          const { payload } = await jwtVerify(token, secretKey);
          if (typeof payload.sub === "string") return payload.sub;
        } catch {
          // signature/expiry failed — fall through to network verify
        }
      }
    }

    // Fallback: authoritative network check (also refreshes an expired session).
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** The signed-in user object (network-authoritative; used by the proxy). */
export async function getUser() {
  if (!SUPABASE_CONFIGURED) return null;
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}
