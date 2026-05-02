"use client";

import { useDailyPlan } from "../hooks/useDailyPlan";
import type { ScoredJob, ScoringConfig } from "../lib/useScoringAPI";

type Props = {
  jobs: ScoredJob[];
  config: ScoringConfig | null;
};

type BarProps = {
  label: string;
  value: number;
  max: number;
  color: string;
  note?: string;
};

function ProgressBar({ label, value, max, color, note }: BarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {note && <span className="text-xs text-gray-400">{note}</span>}
          <span className="font-bold tabular-nums text-gray-900">
            {value}
            {max < 9999 && (
              <span className="text-gray-400 font-normal"> / {max}</span>
            )}
          </span>
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

export function ProgressTracker({ jobs, config }: Props) {
  const plan = useDailyPlan(jobs, config);

  const replied     = jobs.filter((j) => ["reply", "interview", "offer"].includes(j.outcome ?? ""));
  const interviewed = jobs.filter((j) => j.outcome === "interview" || j.outcome === "offer");
  const total       = jobs.length;

  const replyGoal     = Math.max(5, Math.ceil(total * 0.1));
  const interviewGoal = Math.max(2, Math.ceil(total * 0.05));

  const replyRate     = total > 0 ? ((replied.length / total) * 100).toFixed(1) : "—";
  const interviewRate = total > 0 ? ((interviewed.length / total) * 100).toFixed(1) : "—";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Progress</h3>
        {plan.streak > 0 && (
          <span className="text-sm font-bold text-amber-500">
            🔥 {plan.streak}d streak
          </span>
        )}
      </div>

      <div className="space-y-4">
        <ProgressBar
          label="Applied today"
          value={plan.appliedToday}
          max={plan.targetToday}
          color={plan.completionPct >= 100 ? "#10b981" : plan.completionPct >= 50 ? "#3b82f6" : "#f59e0b"}
          note={plan.completionPct >= 100 ? "✓ done" : undefined}
        />
        <ProgressBar
          label="Total applications"
          value={total}
          max={Math.max(total, 100)}
          color="#8b5cf6"
        />
        <ProgressBar
          label="Replies received"
          value={replied.length}
          max={replyGoal}
          color="#10b981"
          note="10% goal"
        />
        <ProgressBar
          label="Interviews"
          value={interviewed.length}
          max={interviewGoal}
          color="#f59e0b"
          note="5% goal"
        />
      </div>

      {/* Mini stats row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
        <MiniStat
          label="Reply rate"
          value={replyRate === "—" ? "—" : `${replyRate}%`}
          color="text-emerald-600"
        />
        <MiniStat
          label="Interview rate"
          value={interviewRate === "—" ? "—" : `${interviewRate}%`}
          color="text-amber-600"
        />
        <MiniStat
          label="Day streak"
          value={plan.streak > 0 ? `${plan.streak}` : "—"}
          color="text-orange-500"
        />
      </div>
    </div>
  );
}
