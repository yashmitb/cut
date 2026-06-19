"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { todayLocal } from "@/lib/nutrition";
import { AskIcon, ChevronLeft, SendIcon, SparkIcon } from "@/components/Icons";

type Msg = { role: "user" | "model"; text: string };

const STARTERS = [
  "Which is better on a cut — white rice or sweet potato?",
  "Have I eaten enough protein today?",
  "Good high-protein snack for tonight?",
  "Is peanut butter okay on a cut?",
];

export default function AskPage() {
  const router = useRouter();
  const date = todayLocal();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput("");
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setBusy(true);
    try {
      const { text: reply } = await api.ask(msg, history, date);
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (e) {
      if (!isCancel(e)) {
        setMessages((m) => [...m, { role: "model", text: (e as Error).message }]);
      }
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <main className="min-h-dvh flex flex-col px-4 pt-[max(env(safe-area-inset-top),18px)]">
      <header className="flex items-center gap-2 mb-2 flex-shrink-0">
        <button onClick={() => router.back()} className="text-[var(--muted)] -ml-1 pressable" aria-label="Back">
          <ChevronLeft />
        </button>
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--p-cal)" }}><AskIcon width={20} height={20} /></span>
          <h1 className="text-lg font-bold">Ask the coach</h1>
        </div>
      </header>

      {/* conversation */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-3">
        {empty ? (
          <div className="flex flex-col items-center text-center pt-10 pb-6 rise">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(201,184,240,0.14)", color: "var(--p-cal)" }}>
              <AskIcon width={30} height={30} />
            </div>
            <p className="font-semibold text-lg">Ask me anything about your food</p>
            <p className="text-sm text-[var(--muted)] mt-1 mb-6 max-w-xs">
              Compare options, sanity-check a meal, or get advice — I know your targets and what you&apos;ve eaten today.
            </p>
            <div className="flex flex-col gap-2 w-full">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="glass card p-3.5 text-left text-sm flex items-center gap-2.5 pressable"
                >
                  <span style={{ color: "var(--p-cal)" }} className="flex-shrink-0"><SparkIcon width={15} height={15} /></span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className="px-3.5 py-2.5 rounded-2xl max-w-[88%] text-sm whitespace-pre-line leading-relaxed"
                style={
                  m.role === "user"
                    ? { alignSelf: "flex-end", background: "rgba(255,255,255,0.92)", color: "#0a0a0a" }
                    : { alignSelf: "flex-start", background: "rgba(255,255,255,0.05)", border: "1px solid var(--line)" }
                }
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="px-3.5 py-3 rounded-2xl self-start" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line)" }}>
                <span className="spin inline-block w-4 h-4 rounded-full align-middle" style={{ border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "var(--p-cal)" }} />
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* input bar */}
      <div className="flex-shrink-0 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
        <div className="flex gap-2">
          <input
            className="field"
            placeholder="Ask a nutrition question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
          />
          <button onClick={() => send(input)} disabled={!input.trim() || busy} className="btn btn-primary !px-4 flex-shrink-0" aria-label="Send">
            <SendIcon width={18} height={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
