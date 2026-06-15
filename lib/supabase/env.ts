// Resolve Supabase public config from any of the names the Vercel integration
// may provide. These two values are safe to expose to the browser.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

/** Auth is only active when Supabase is configured. Otherwise we run in
 *  local single-user mode (handy for dev without the cloud project). */
export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);
