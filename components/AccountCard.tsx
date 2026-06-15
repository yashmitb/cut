"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { SUPABASE_CONFIGURED } from "@/lib/supabase/env";
import { UserIcon } from "./Icons";

export default function AccountCard() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) {
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowser();
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .finally(() => setLoading(false));
  }, []);

  // In local single-user mode there's no account to show.
  if (!SUPABASE_CONFIGURED) return null;

  return (
    <section className="glass card p-4 mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(201,184,240,0.16)", color: "var(--p-cal)" }}
        >
          <UserIcon width={20} height={20} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Account</p>
          <p className="text-xs text-[var(--muted)] truncate">
            {loading ? "Loading…" : email ?? "Signed in"}
          </p>
        </div>
      </div>
      <form action="/auth/signout" method="post">
        <button type="submit" className="btn btn-ghost !py-2 !px-3 !text-xs flex-shrink-0">
          Sign out
        </button>
      </form>
    </section>
  );
}
