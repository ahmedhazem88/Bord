/**
 * Profile-completeness ring for individual onboarding. DESIGN-PRINCIPLES.md,
 * Zeigarnik Effect: the pull to finish comes from the incompleteness staying
 * visible, so this renders the gap, not just the progress -- an unfinished
 * ring, not a hidden percentage.
 */
export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  label,
}: {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-ink-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-brand-500 transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-extrabold text-ink-900">{value}%</span>
        {label && <span className="text-[11px] font-medium text-ink-500">{label}</span>}
      </div>
    </div>
  );
}
