// Branded loading indicator — the app's calorie-ring mark, spinning. Replaces
// skeleton "ghost" placeholders for a cleaner, on-brand loading state.
export default function AppLoader({
  label,
  size = 60,
  full = true,
}: {
  label?: string;
  size?: number;
  full?: boolean;
}) {
  return (
    <div
      className={
        full
          ? "min-h-[55dvh] flex flex-col items-center justify-center gap-4"
          : "flex flex-col items-center justify-center gap-3 py-8"
      }
    >
      <div className="loader-breathe">
        <svg className="loader-ring" width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="var(--p-cal)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="62 251"
            style={{ filter: "drop-shadow(0 0 6px rgba(201,184,240,0.5))" }}
          />
        </svg>
      </div>
      {label && <p className="text-sm text-[var(--muted)]">{label}</p>}
    </div>
  );
}
