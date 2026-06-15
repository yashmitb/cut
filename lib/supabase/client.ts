"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

export function createSupabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
