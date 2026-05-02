type Props = {
  score: number;   // 0-100
  size?: "sm" | "md" | "lg";
};

const SIZE = { sm: 44, md: 56, lg: 72 };

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981"; // green
  if (score >= 65) return "#3b82f6"; // blue
  if (score >= 50) return "#f59e0b"; // amber
  return "#ef4444";                  // red
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 50) return "Fair";
  return "Weak";
}

export function ScoreBadge({ score, size = "md" }: Props) {
  const px = SIZE[size];
  const radius = px * 0.38;
  const stroke = px * 0.095;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);
  const fontSize = size === "lg" ? 18 : size === "md" ? 14 : 11;

  return (
    <div className="relative flex-shrink-0" style={{ width: px, height: px }}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
        {/* Track */}
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${px / 2} ${px / 2})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {/* Score number */}
      <span
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums"
        style={{ fontSize, color }}
      >
        {score}
      </span>
    </div>
  );
}

export function ScoreLabel({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span className="text-xs font-semibold" style={{ color }}>
      {scoreLabel(score)}
    </span>
  );
}
