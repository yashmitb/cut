"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { isCancel } from "@/lib/retry";
import { sumTotals } from "@/lib/format";
import { MEAL_META, MEAL_ORDER } from "@/lib/types";
import type { FoodLog, MealType } from "@/lib/types";
import { ChevronDown, Layers, TrashIcon } from "./Icons";

export default function LogGroup({
  id,
  label,
  items,
  date,
  meal,
  onChanged,
}: {
  id: string;
  label: string;
  items: FoodLog[];
  date: string;
  meal: MealType;
  onChanged: (items: FoodLog[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  const [busy, setBusy] = useState(false);
  const t = sumTotals(items);

  async function run(fn: () => Promise<{ items: FoodLog[] }>) {
    setBusy(true);
    try {
      const { items } = await fn();
      onChanged(items);
    } catch (e) {
      if (!isCancel(e)) alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass card overflow-hidden">
      {/* header */}
      <button onClick={() => setOpen((o) => !o)} className="w-full p-3.5 flex items-center gap-3 text-left pressable">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(201,184,240,0.16)", color: "var(--p-cal)" }}>
          <Layers width={18} height={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{label}</p>
          <p className="text-xs text-[var(--muted)] truncate">
            {items.length} items · P {Math.round(t.protein)} · C {Math.round(t.carbs)} · F {Math.round(t.fat)}
          </p>
        </div>
        <span className="font-bold tabular">{Math.round(t.calories)}</span>
        <ChevronDown width={18} height={18} className="text-[var(--faint)] transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {/* body */}
      {open && (
        <div className="px-3.5 pb-3.5 pt-1" style={{ borderTop: "1px solid var(--line)" }}>
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--line)" }}>
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-2 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{it.name}</p>
                  {it.quantity && <p className="text-[11px] text-[var(--faint)] truncate">{it.quantity}</p>}
                </div>
                <span className="text-sm tabular text-[var(--muted)]">{Math.round(it.calories)}</span>
                <button onClick={() => run(() => api.deleteItem(it.id, date))} disabled={busy} className="text-[var(--faint)] hover:text-[var(--p-warn)] pressable p-1" aria-label="Remove">
                  <TrashIcon width={15} height={15} />
                </button>
              </li>
            ))}
          </ul>

          {/* rename */}
          <div className="mt-3">
            {editing ? (
              <div className="flex gap-2">
                <input className="field !py-2 !text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
                <button onClick={() => { setEditing(false); if (name.trim() && name !== label) run(() => api.moveGroup(id, { group_label: name.trim() })); }} className="btn btn-ghost !px-3 !text-xs">Save</button>
              </div>
            ) : (
              <button onClick={() => { setName(label); setEditing(true); }} className="text-xs text-[var(--muted)] underline pressable">Rename group</button>
            )}
          </div>

          {/* move meal */}
          <p className="label !text-[10px] mt-3 mb-1.5">Move to</p>
          <div className="seg">
            {MEAL_ORDER.map((m) => (
              <div key={m} className="seg-item !text-[11px] !px-1 !py-1.5" data-on={meal === m} onClick={() => meal !== m && run(() => api.moveGroup(id, { meal: m }))}>
                {MEAL_META[m].label}
              </div>
            ))}
          </div>

          <button onClick={() => run(() => api.deleteGroup(id, date))} disabled={busy} className="flex items-center gap-1.5 text-xs mt-3 pressable" style={{ color: "var(--p-warn)" }}>
            <TrashIcon width={13} height={13} /> Delete group
          </button>
        </div>
      )}
    </div>
  );
}
