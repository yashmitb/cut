"use client";

interface Props {
  label: string;
  value: number;
  target: number;
  unit?: string;
  color: string;
}

export default function MacroBar({ label, value, target, unit = "g", color }: Props) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const over = value > target * 1.05;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="text-xs text-[var(--muted)] tabular">
          <span className="text-[var(--fg)] font-semibold">{Math.round(value)}</span>
          {" / "}
          {target}
          {unit}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: over ? "var(--p-warn)" : color,
            transition: "width 0.6s cubic-bezier(0.2,0.8,0.2,1)",
            boxShadow: `0 0 8px ${color}55`,
          }}
        />
      </div>
    </div>
  );
}
