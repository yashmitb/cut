"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { formatAmount, parseLeadingNumber } from "@/lib/format";
import { CheckIcon, PencilIcon, TrashIcon, WarnIcon } from "./Icons";
import { MEAL_META, MEAL_ORDER } from "@/lib/types";
import type { FoodLog } from "@/lib/types";

const MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"] as const;
type MacroKey = (typeof MACRO_KEYS)[number];

interface Base {
  amount: number; // parsed leading number, or 1 if none
  quantity: string; // original quantity text
  values: Record<MacroKey, number>;
}

export default function LogItem({
  item,
  date,
  onChanged,
  hideMeal = false,
}: {
  item: FoodLog;
  date: string;
  onChanged: (items: FoodLog[]) => void;
  hideMeal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(item);

  // portion scaler state
  const [base, setBase] = useState<Base>({ amount: 1, quantity: "", values: {} as Record<MacroKey, number> });
  const [hasNumber, setHasNumber] = useState(true);
  const [unit, setUnit] = useState("");
  const [amountStr, setAmountStr] = useState("1");

  function openEdit() {
    const parsed = parseLeadingNumber(item.quantity);
    const baseAmount = parsed.num ?? 1;
    const values = Object.fromEntries(MACRO_KEYS.map((k) => [k, item[k] || 0])) as Record<MacroKey, number>;
    setBase({ amount: baseAmount, quantity: item.quantity, values });
    setHasNumber(parsed.num != null);
    setUnit(parsed.unit);
    setAmountStr(formatAmount(baseAmount));
    setDraft(item);
    setOpen(true);
  }

  // Rescale every macro from the baseline by amount/baseAmount and rewrite quantity.
  function applyScale(amount: number, nextUnit: string, numbered: boolean) {
    const f = base.amount > 0 ? amount / base.amount : amount;
    const scaled = Object.fromEntries(MACRO_KEYS.map((k) => [k, Math.round(base.values[k] * f)])) as Record<MacroKey, number>;
    const quantity = numbered
      ? `${formatAmount(amount)} ${nextUnit}`.trim()
      : amount === 1
        ? base.quantity
        : `${formatAmount(amount)}× ${base.quantity}`;
    setDraft((d) => ({ ...d, ...scaled, quantity }));
  }

  function setAmount(next: number) {
    const a = Math.max(0, next);
    setAmountStr(formatAmount(a));
    applyScale(a, unit, hasNumber);
  }

  function onAmountInput(v: string) {
    const cleaned = v.replace(/[^\d.]/g, "");
    setAmountStr(cleaned);
    const n = parseFloat(cleaned);
    if (isFinite(n)) applyScale(n, unit, hasNumber);
  }

  async function save() {
    setBusy(true);
    try {
      const { items } = await api.editItem({ ...draft, id: item.id });
      onChanged(items);
      setOpen(false);
    } catch (e) {
      if (!isCancel(e)) alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const { items } = await api.deleteItem(item.id, date);
      onChanged(items);
    } catch (e) {
      if (!isCancel(e)) alert((e as Error).message);
      setBusy(false);
    }
  }

  const num = (k: MacroKey, label: string, color: string) => (
    <label className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wide" style={{ color }}>{label}</span>
      <input
        className="w-full text-center tabular text-sm font-semibold bg-transparent border-b border-[var(--line)] focus:border-white/40 outline-none pb-0.5"
        inputMode="numeric"
        value={String(draft[k] ?? 0)}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 }))}
      />
    </label>
  );

  if (open) {
    const amount = parseFloat(amountStr) || 0;
    return (
      <div className="glass card p-3.5">
        <input
          className="font-semibold bg-transparent outline-none w-full mb-3"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />

        {/* portion scaler */}
        <p className="label !text-[10px] mb-1.5">{hasNumber ? "Amount" : "Servings"}</p>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setAmount(Math.max(0, amount - 1))} className="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-lg pressable flex-shrink-0" aria-label="Less">−</button>
          <input
            className="field tabular text-center !py-2 !w-16 flex-shrink-0"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => onAmountInput(e.target.value)}
          />
          <button onClick={() => setAmount(amount + 1)} className="w-9 h-9 rounded-xl btn-ghost flex items-center justify-center text-lg pressable flex-shrink-0" aria-label="More">+</button>
          {hasNumber ? (
            <input
              className="field !py-2 flex-1 min-w-0"
              value={unit}
              placeholder="unit (cups, oz…)"
              onChange={(e) => { setUnit(e.target.value); applyScale(amount, e.target.value, true); }}
            />
          ) : (
            <span className="text-sm text-[var(--muted)] truncate flex-1">{base.quantity}</span>
          )}
        </div>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setAmount(Math.round((amount / 2) * 100) / 100)} className="chip pressable !py-1 !px-2.5">½×</button>
          <button onClick={() => setAmount(amount * 2)} className="chip pressable !py-1 !px-2.5">2×</button>
          {hasNumber && base.amount !== amount && (
            <button onClick={() => setAmount(base.amount)} className="chip pressable !py-1 !px-2.5 text-[var(--muted)]">reset</button>
          )}
        </div>

        {/* macros (auto-scaled, still hand-editable) */}
        <div className="grid grid-cols-5 gap-2 pt-2.5 mb-3" style={{ borderTop: "1px solid var(--line)" }}>
          {num("calories", "kcal", "var(--p-cal)")}
          {num("protein", "P", "var(--p-protein)")}
          {num("carbs", "C", "var(--p-carbs)")}
          {num("fat", "F", "var(--p-fat)")}
          {num("fiber", "Fiber", "var(--p-fiber)")}
        </div>

        {!hideMeal && (
          <>
            <p className="label !text-[10px] mb-1.5">Meal</p>
            <div className="seg mb-3">
              {MEAL_ORDER.map((m) => (
                <div key={m} className="seg-item !text-[11px] !px-1 !py-1.5" data-on={draft.meal === m} onClick={() => setDraft((d) => ({ ...d, meal: m }))}>
                  {MEAL_META[m].label}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex gap-2">
          <button onClick={() => setOpen(false)} className="btn btn-ghost flex-1 !py-2.5">Cancel</button>
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 !py-2.5">
            {busy ? "…" : <><CheckIcon width={16} height={16} /> Save</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass card p-3.5 flex items-center gap-3">
      <button onClick={openEdit} className="flex-1 min-w-0 text-left pressable">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold truncate">{item.name}</p>
          {item.confidence != null && item.confidence < 0.65 && (
            <span title="AI was unsure — double check" style={{ color: "var(--p-warn)" }}>
              <WarnIcon width={14} height={14} />
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--muted)] truncate">
          {item.quantity ? `${item.quantity} · ` : ""}
          P {Math.round(item.protein)} · C {Math.round(item.carbs)} · F {Math.round(item.fat)} · Fb {Math.round(item.fiber)}
        </p>
      </button>
      <span className="font-bold tabular">{Math.round(item.calories)}</span>
      <button onClick={openEdit} className="text-[var(--faint)] hover:text-[var(--fg)] pressable p-1" aria-label="Edit">
        <PencilIcon width={16} height={16} />
      </button>
      <button onClick={remove} disabled={busy} className="text-[var(--faint)] hover:text-[var(--p-warn)] pressable p-1" aria-label="Delete">
        <TrashIcon width={16} height={16} />
      </button>
    </div>
  );
}
