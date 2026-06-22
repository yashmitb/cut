"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { fileToScaledDataUrl } from "@/lib/image";
import { sumTotals } from "@/lib/format";
import { todayLocal } from "@/lib/nutrition";
import { MEAL_META, MEAL_ORDER, mealForHour } from "@/lib/types";
import type { FoodItem, MealType } from "@/lib/types";
import {
  CameraIcon,
  CheckIcon,
  ChevronLeft,
  ImageIcon,
  Layers,
  PlusIcon,
  SendIcon,
  SparkIcon,
  TrashIcon,
  WarnIcon,
} from "@/components/Icons";

type ChatMsg = { role: "user" | "model"; text: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AddPage() {
  return (
    <Suspense fallback={null}>
      <AddInner />
    </Suspense>
  );
}

function AddInner() {
  const router = useRouter();
  const params = useSearchParams();
  const startText = params.get("mode") === "text";
  const qDate = params.get("date");
  const date = qDate && DATE_RE.test(qDate) ? qDate : todayLocal();
  const qMeal = params.get("meal") as MealType | null;

  const [meal, setMeal] = useState<MealType>(qMeal && MEAL_ORDER.includes(qMeal) ? qMeal : mealForHour(new Date().getHours()));
  const [stage, setStage] = useState<"input" | "loading" | "review">("input");
  const [loadingMsg, setLoadingMsg] = useState("Analyzing your meal…");
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [source, setSource] = useState<"image" | "manual" | "chat">("manual");
  const [needsClarify, setNeedsClarify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recent, setRecent] = useState<(FoodItem & { count?: number })[]>([]);
  const [quickAdded, setQuickAdded] = useState(0);
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const [addedCounts, setAddedCounts] = useState<Record<number, number>>({});
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [groupOn, setGroupOn] = useState(false);
  const [groupName, setGroupName] = useState("");

  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  useEffect(() => {
    api.getRecent().then(({ items }) => setRecent(items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleFile(file: File) {
    setError(null);
    try {
      const dataUrl = await fileToScaledDataUrl(file);
      setPreview(dataUrl);
      setSource("image");
      setStage("loading");
      setLoadingMsg("Reading your plate…");
      const res = await api.analyze(dataUrl, "image/jpeg");
      applyResult(res.items, res.notes, res.clarification_question, res.needs_clarification);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
      setStage("input");
    }
  }

  async function handleText() {
    const msg = textInput.trim();
    if (!msg) return;
    setError(null);
    setSource("manual");
    setStage("loading");
    setLoadingMsg("Crunching the numbers…");
    try {
      const res = await api.chat(msg, [], []);
      applyResult(res.items, res.notes, res.clarification_question, res.needs_clarification);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
      setStage("input");
    }
  }

  function applyResult(newItems: FoodItem[], notes: string | null, clarify: string | null, needs: boolean) {
    setItems(newItems);
    setNeedsClarify(needs);
    const opener = needs && clarify ? clarify : notes;
    setChat(opener ? [{ role: "model", text: opener }] : []);
    setStage("review");
  }

  async function quickAdd(item: FoodItem, idx: number) {
    try {
      await api.addItems(date, [item], "quick", meal);
      setQuickAdded((n) => n + 1);
      setAddedCounts((m) => ({ ...m, [idx]: (m[idx] || 0) + 1 }));
      setJustAdded(idx);
      setToast(`Added ${item.name} → ${MEAL_META[meal].label}`);
      setTimeout(() => setJustAdded((c) => (c === idx ? null : c)), 1100);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
    }
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || busy) return;
    setChatInput("");
    setChat((c) => [...c, { role: "user", text: msg }]);
    setBusy(true);
    setSource((s) => (s === "image" ? "image" : "chat"));
    try {
      const history = chat.map((m) => ({ role: m.role, text: m.text }));
      const res = await api.chat(msg, items, history);
      setItems(res.items);
      setNeedsClarify(res.needs_clarification);
      setChat((c) => [...c, { role: "model", text: res.notes || "Updated." }]);
    } catch (e) {
      if (!isCancel(e)) setChat((c) => [...c, { role: "model", text: "Hmm, I couldn't process that: " + (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  function editItem(idx: number, patch: Partial<FoodItem>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  async function confirm() {
    if (!items.length || busy) return;
    setBusy(true);
    try {
      const group =
        groupOn && items.length > 1
          ? { group_id: crypto.randomUUID(), group_label: groupName.trim() || items[0].name }
          : undefined;
      await api.addItems(date, items, source, meal, group);
      router.replace(backToDay);
    } catch (e) {
      if (!isCancel(e)) setError((e as Error).message);
      setBusy(false);
    }
  }

  const totals = sumTotals(items);
  const isToday = date === todayLocal();
  const dateLabel = isToday ? "today" : new Date(date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  // return to the day being edited (not always today)
  const backToDay = isToday ? "/" : `/?date=${date}`;

  return (
    <main className="min-h-dvh flex flex-col px-4 pt-[max(env(safe-area-inset-top),18px)]">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => (quickAdded > 0 ? router.replace(backToDay) : router.back())} className="text-[var(--muted)] -ml-1 pressable" aria-label="Back">
            <ChevronLeft />
          </button>
          <h1 className="text-lg font-bold">{stage === "review" ? "Review & log" : "Add food"}</h1>
        </div>
        {quickAdded > 0 && (
          <button onClick={() => router.replace(backToDay)} className="chip pressable" style={{ color: "var(--p-fiber)", borderColor: "rgba(181,232,201,0.3)" }}>
            <CheckIcon width={13} height={13} /> {quickAdded} added · Done
          </button>
        )}
      </header>

      {/* meal selector */}
      <div className="seg mb-4">
        {MEAL_ORDER.map((m) => (
          <div key={m} className="seg-item !text-xs !px-1" data-on={meal === m} onClick={() => setMeal(m)}>
            {MEAL_META[m].label}
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed top-[max(env(safe-area-inset-top),12px)] left-1/2 -translate-x-1/2 z-[70] glass-strong rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2 pop" style={{ color: "var(--p-fiber)" }}>
          <CheckIcon width={15} height={15} /> {toast}
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {error && (
        <div className="flex gap-2 p-3 rounded-2xl mb-3 text-sm" style={{ background: "rgba(247,159,159,0.1)", border: "1px solid rgba(247,159,159,0.25)" }}>
          <WarnIcon width={18} height={18} style={{ color: "var(--p-warn)", flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ------- INPUT STAGE ------- */}
      {stage === "input" && (
        <div className="flex-1 flex flex-col gap-4 pb-8 rise">
          {recent.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-xs text-[var(--faint)] uppercase tracking-wider">Quick add · tap to log instantly</p>
                {recent.length > 8 && (
                  <button onClick={() => setShowAllRecent((s) => !s)} className="text-[11px] text-[var(--muted)] pressable">
                    {showAllRecent ? "Show less" : `+${recent.length - 8} more`}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(showAllRecent ? recent : recent.slice(0, 8)).map((it, i) => {
                  const cnt = addedCounts[i] || 0;
                  const flash = justAdded === i;
                  return (
                    <button
                      key={i}
                      onClick={() => quickAdd(it, i)}
                      className="chip pressable !py-1.5 !px-3 transition-transform"
                      style={
                        flash
                          ? { color: "var(--p-fiber)", borderColor: "rgba(181,232,201,0.5)", background: "rgba(181,232,201,0.16)", transform: "scale(1.05)" }
                          : cnt > 0
                            ? { color: "var(--fg)", borderColor: "rgba(181,232,201,0.35)" }
                            : { color: "var(--fg)" }
                      }
                    >
                      {flash || cnt > 0 ? <CheckIcon width={12} height={12} style={{ color: "var(--p-fiber)" }} /> : <PlusIcon width={12} height={12} />}
                      <span className="max-w-[150px] truncate">{flash ? "Added!" : it.name}</span>
                      {!flash && <span className="text-[var(--faint)] tabular">{Math.round(it.calories)}</span>}
                      {cnt > 0 && !flash && <span className="text-[10px] font-bold" style={{ color: "var(--p-fiber)" }}>×{cnt}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => cameraRef.current?.click()}
            className="glass-strong card flex flex-col items-center justify-center py-12 pressable"
            style={{ background: "linear-gradient(160deg, rgba(201,184,240,0.12), rgba(168,208,240,0.06))" }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(255,255,255,0.9)", color: "#0a0a0a" }}>
              <CameraIcon width={30} height={30} />
            </div>
            <p className="font-semibold text-lg">Take a photo</p>
            <p className="text-sm text-[var(--muted)] mt-1">Point at your plate — AI does the rest</p>
          </button>

          <button onClick={() => uploadRef.current?.click()} className="glass card flex items-center justify-center gap-2 py-4 pressable text-[var(--muted)] font-semibold">
            <ImageIcon width={20} height={20} /> Upload from library
          </button>

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
            <span className="text-xs text-[var(--faint)] uppercase tracking-wider">or describe it</span>
            <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
          </div>

          <div className="glass card p-3">
            <textarea
              autoFocus={startText}
              className="field !bg-transparent !border-0 resize-none min-h-[80px] !p-1"
              placeholder="I ate 1 cup of rice, 6 oz grilled chicken, and a tbsp of olive oil…"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
            <button onClick={handleText} disabled={!textInput.trim()} className="btn btn-primary w-full mt-1">
              <SparkIcon width={18} height={18} /> Analyze
            </button>
          </div>
        </div>
      )}

      {/* ------- LOADING ------- */}
      {stage === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 pb-16">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="meal" className="w-44 h-44 object-cover rounded-3xl" style={{ filter: "brightness(0.7)" }} />
          )}
          <div className="flex items-center gap-3">
            <span className="spin w-5 h-5 rounded-full" style={{ border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "var(--p-cal)" }} />
            <span className="text-[var(--muted)]">{loadingMsg}</span>
          </div>
        </div>
      )}

      {/* ------- REVIEW STAGE ------- */}
      {stage === "review" && (
        <div className="flex-1 flex flex-col pb-40">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="meal" className="w-full h-40 object-cover rounded-3xl mb-3" />
          )}

          {needsClarify && (
            <div className="flex gap-2.5 p-3.5 rounded-2xl mb-3 rise" style={{ background: "rgba(247,197,159,0.1)", border: "1px solid rgba(247,197,159,0.25)" }}>
              <span style={{ color: "var(--p-warn)" }} className="flex-shrink-0 mt-0.5"><WarnIcon width={18} height={18} /></span>
              <p className="text-sm">I wasn&apos;t fully sure on some items — check the flagged ones, or just tell me below to fix them before logging.</p>
            </div>
          )}

          <div className="flex flex-col gap-2.5 mb-4">
            {items.map((it, i) => (
              <ItemCard key={i} item={it} onChange={(p) => editItem(i, p)} onRemove={() => removeItem(i)} />
            ))}
            {items.length === 0 && <p className="text-center text-[var(--muted)] text-sm py-6">No items — describe your meal below.</p>}
          </div>

          {/* combine into one group */}
          {items.length > 1 && (
            <div className="glass card p-3.5 mb-3">
              <button onClick={() => setGroupOn((g) => !g)} className="w-full flex items-center gap-3 pressable">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(201,184,240,0.16)", color: "var(--p-cal)" }}>
                  <Layers width={16} height={16} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold">Combine into one item</p>
                  <p className="text-xs text-[var(--muted)]">Group these {items.length} as one collapsible entry (e.g. a drink mix)</p>
                </div>
                <span className="relative w-10 h-6 rounded-full flex-shrink-0 transition-colors" style={{ background: groupOn ? "var(--p-cal)" : "rgba(255,255,255,0.12)" }}>
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: groupOn ? "18px" : "2px" }} />
                </span>
              </button>
              {groupOn && (
                <input className="field mt-3 !py-2 !text-sm" placeholder={items[0]?.name || "Group name"} value={groupName} onChange={(e) => setGroupName(e.target.value)} />
              )}
            </div>
          )}

          <div className="glass card p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <span style={{ color: "var(--p-cal)" }}><SparkIcon width={16} height={16} /></span>
              <span className="text-sm font-semibold">Coach</span>
              <span className="text-xs text-[var(--faint)]">— correct anything, it learns</span>
            </div>
            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto mb-3">
              {chat.map((m, i) => (
                <div key={i} className="text-sm px-3 py-2 rounded-2xl max-w-[88%]"
                  style={m.role === "user" ? { alignSelf: "flex-end", background: "rgba(255,255,255,0.92)", color: "#0a0a0a" } : { alignSelf: "flex-start", background: "rgba(255,255,255,0.05)" }}>
                  {m.text}
                </div>
              ))}
              {busy && (
                <div className="text-sm px-3 py-2 rounded-2xl self-start" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <span className="spin inline-block w-3.5 h-3.5 rounded-full align-middle" style={{ border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "var(--p-cal)" }} />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input className="field" placeholder="e.g. that's 1 cup of rice, not 2" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} />
              <button onClick={sendChat} disabled={!chatInput.trim() || busy} className="btn btn-ghost !px-3.5" aria-label="Send"><SendIcon width={18} height={18} /></button>
            </div>
          </div>
        </div>
      )}

      {/* confirm bar */}
      {stage === "review" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 pointer-events-none">
          <div className="glass-strong w-full max-w-md rounded-[24px] p-3 flex items-center gap-3 pointer-events-auto">
            <div className="pl-2">
              <p className="text-xs text-[var(--muted)]">{MEAL_META[meal].label} · {dateLabel}</p>
              <p className="font-bold tabular leading-tight">{Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P</p>
            </div>
            <button onClick={confirm} disabled={!items.length || busy} className="btn btn-primary flex-1">
              {busy ? <span className="spin w-4 h-4 rounded-full" style={{ border: "2px solid rgba(0,0,0,0.25)", borderTopColor: "#000" }} /> : <CheckIcon width={18} height={18} />}
              Log{isToday ? "" : ` to ${dateLabel}`}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ItemCard({ item, onChange, onRemove }: { item: FoodItem; onChange: (p: Partial<FoodItem>) => void; onRemove: () => void }) {
  const low = item.confidence < 0.65;
  const num = (k: keyof FoodItem, label: string, color?: string) => (
    <label className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wide" style={{ color: color || "var(--faint)" }}>{label}</span>
      <input
        className="w-full text-center tabular text-sm font-semibold bg-transparent border-b border-[var(--line)] focus:border-white/40 outline-none pb-0.5"
        inputMode="numeric"
        value={String(item[k] ?? 0)}
        onChange={(e) => onChange({ [k]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 } as Partial<FoodItem>)}
      />
    </label>
  );
  return (
    <div className="glass card p-3.5">
      <div className="flex items-start gap-2 mb-2.5">
        <div className="flex-1 min-w-0">
          <input className="font-semibold bg-transparent outline-none w-full" value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
          <input className="text-xs text-[var(--muted)] bg-transparent outline-none w-full mt-0.5" value={item.quantity} placeholder="portion" onChange={(e) => onChange({ quantity: e.target.value })} />
        </div>
        {low && (
          <span className="chip flex-shrink-0" style={{ color: "var(--p-warn)", borderColor: "rgba(247,197,159,0.3)", background: "rgba(247,197,159,0.08)" }}>
            <WarnIcon width={11} height={11} /> unsure
          </span>
        )}
        <button onClick={onRemove} className="text-[var(--faint)] hover:text-[var(--p-warn)] pressable p-0.5 flex-shrink-0" aria-label="Remove">
          <TrashIcon width={16} height={16} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2 pt-2.5" style={{ borderTop: "1px solid var(--line)" }}>
        {num("calories", "kcal", "var(--p-cal)")}
        {num("protein", "P", "var(--p-protein)")}
        {num("carbs", "C", "var(--p-carbs)")}
        {num("fat", "F", "var(--p-fat)")}
        {num("fiber", "Fiber", "var(--p-fiber)")}
      </div>
      {item.assumptions && <p className="text-[11px] text-[var(--faint)] mt-2 italic">Assumed: {item.assumptions}</p>}
    </div>
  );
}
