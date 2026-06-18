"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { CheckIcon, PencilIcon, TrashIcon, WarnIcon } from "./Icons";
import { MEAL_META, MEAL_ORDER } from "@/lib/types";
import type { FoodLog } from "@/lib/types";

export default function LogItem({
  item,
  date,
  onChanged,
}: {
  item: FoodLog;
  date: string;
  onChanged: (items: FoodLog[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(item);

  async function save() {
    setBusy(true);
    try {
      const { items } = await api.editItem({ ...draft, id: item.id });
      onChanged(items);
      setOpen(false);
    } catch (e) {
      alert((e as Error).message);
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
      alert((e as Error).message);
      setBusy(false);
    }
  }

  const num = (k: keyof FoodLog, label: string, color: string) => (
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
    return (
      <div className="glass card p-3.5">
        <input
          className="font-semibold bg-transparent outline-none w-full mb-1"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <input
          className="text-xs text-[var(--muted)] bg-transparent outline-none w-full mb-2.5"
          value={draft.quantity}
          placeholder="portion"
          onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
        />
        <div className="grid grid-cols-5 gap-2 pt-2.5 mb-3" style={{ borderTop: "1px solid var(--line)" }}>
          {num("calories", "kcal", "var(--p-cal)")}
          {num("protein", "P", "var(--p-protein)")}
          {num("carbs", "C", "var(--p-carbs)")}
          {num("fat", "F", "var(--p-fat)")}
          {num("fiber", "Fiber", "var(--p-fiber)")}
        </div>
        <p className="label !text-[10px] mb-1.5">Meal</p>
        <div className="seg mb-3">
          {MEAL_ORDER.map((m) => (
            <div key={m} className="seg-item !text-[11px] !px-1 !py-1.5" data-on={draft.meal === m} onClick={() => setDraft((d) => ({ ...d, meal: m }))}>
              {MEAL_META[m].label}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setDraft(item); setOpen(false); }} className="btn btn-ghost flex-1 !py-2.5">Cancel</button>
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 !py-2.5">
            {busy ? "…" : <><CheckIcon width={16} height={16} /> Save</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass card p-3.5 flex items-center gap-3">
      <button onClick={() => { setDraft(item); setOpen(true); }} className="flex-1 min-w-0 text-left pressable">
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
      <button onClick={() => { setDraft(item); setOpen(true); }} className="text-[var(--faint)] hover:text-[var(--fg)] pressable p-1" aria-label="Edit">
        <PencilIcon width={16} height={16} />
      </button>
      <button onClick={remove} disabled={busy} className="text-[var(--faint)] hover:text-[var(--p-warn)] pressable p-1" aria-label="Delete">
        <TrashIcon width={16} height={16} />
      </button>
    </div>
  );
}
