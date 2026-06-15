import { NextResponse } from "next/server";
import { USER_ID } from "@/lib/db";
import { SUPABASE_CONFIGURED } from "./env";
import { createSupabaseServer } from "./server";

/**
 * The id that scopes all data for the current request.
 * - With Supabase configured: the authenticated user's id, or null if signed out.
 * - Without Supabase (local dev): a fixed single-user id so the app still works.
 */
export async function getUserId(): Promise<string | null> {
  if (!SUPABASE_CONFIGURED) return USER_ID;
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** The signed-in user object (or null). */
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
