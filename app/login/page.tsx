"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { SUPABASE_CONFIGURED } from "@/lib/supabase/env";
import { CheckIcon, WarnIcon } from "@/components/Icons";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "google" | "email">(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? "Sign-in failed — please try again." : null);

  async function withGoogle() {
    setError(null);
    setBusy("google");
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // browser is redirected to Google here
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setBusy("email");
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center rise">
        {/* brand mark */}
        <div className="relative mb-6 pop">
          <svg width="84" height="84" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
            <circle cx="50" cy="50" r="38" fill="none" stroke="var(--p-cal)" strokeWidth="9" strokeLinecap="round" strokeDasharray="175 239" transform="rotate(-90 50 50)" style={{ filter: "drop-shadow(0 0 8px rgba(201,184,240,0.5))" }} />
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Cut</h1>
        <p className="text-[var(--muted)] mt-1.5 mb-9 text-center">Sign in to sync your cut across every device.</p>

        {!SUPABASE_CONFIGURED ? (
          <div className="glass card p-5 w-full text-center">
            <p className="text-sm text-[var(--muted)]">
              Auth isn&apos;t configured here. Set <code className="text-[var(--fg)]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="text-[var(--fg)]">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to enable sign-in.
            </p>
          </div>
        ) : sent ? (
          <div className="glass card p-6 w-full flex flex-col items-center text-center rise">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(181,232,201,0.14)", color: "var(--p-fiber)" }}>
              <CheckIcon width={24} height={24} />
            </div>
            <p className="font-semibold">Check your email</p>
            <p className="text-sm text-[var(--muted)] mt-1">We sent a magic sign-in link to {email}.</p>
            <button onClick={() => setSent(false)} className="text-xs text-[var(--muted)] underline mt-4 pressable">Use a different method</button>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-3">
            <button onClick={withGoogle} disabled={busy !== null} className="btn btn-primary w-full !py-3.5">
              {busy === "google" ? (
                <span className="spin w-4 h-4 rounded-full" style={{ border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "#000" }} />
              ) : (
                <GoogleGlyph />
              )}
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
              <span className="text-xs text-[var(--faint)] uppercase tracking-wider">or</span>
              <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
            </div>

            <form onSubmit={withEmail} className="flex flex-col gap-2.5">
              <input
                className="field"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" disabled={!email.trim() || busy !== null} className="btn btn-ghost w-full !py-3.5">
                {busy === "email" ? (
                  <span className="spin w-4 h-4 rounded-full" style={{ border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--fg)" }} />
                ) : null}
                Email me a magic link
              </button>
            </form>
          </div>
        )}

        {error && (
          <div className="flex gap-2 p-3 rounded-2xl mt-4 text-sm w-full" style={{ background: "rgba(247,159,159,0.1)", border: "1px solid rgba(247,159,159,0.25)" }}>
            <WarnIcon width={18} height={18} style={{ color: "var(--p-warn)", flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <p className="text-[11px] text-[var(--faint)] mt-8 text-center">
          Your data is private to your account and synced via Supabase.
        </p>
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
