"use client";

interface Props {
  consumed: number;
  target: number;
}

export default function CalorieRing({ consumed, target }: Props) {
  const size = 220;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const over = consumed > target;
  const remaining = Math.round(target - consumed);
  const dash = c * pct;

  const color = over ? "var(--p-warn)" : "var(--p-cal)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 0.7s cubic-bezier(0.2,0.8,0.2,1), stroke 0.4s ease", filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tabular tracking-tight">
          {Math.abs(remaining)}
        </span>
        <span className="text-sm text-[var(--muted)] mt-1">
          {over ? "over budget" : "kcal left"}
        </span>
        <span className="text-xs text-[var(--faint)] mt-2 tabular">
          {Math.round(consumed)} / {target}
        </span>
      </div>
    </div>
  );
}
