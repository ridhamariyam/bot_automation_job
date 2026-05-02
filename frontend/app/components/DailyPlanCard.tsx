"use client";

import { platformLabel } from "../lib/platforms";
import { useDailyPlan } from "../hooks/useDailyPlan";
import type { ScoredJob, ScoringConfig } from "../lib/useScoringAPI";

type Props = {
  jobs: ScoredJob[];
  config: ScoringConfig | null;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DailyPlanCard({ jobs, config }: Props) {
  const plan = useDailyPlan(jobs, config);

  const barColor =
    plan.completionPct >= 100 ? "#10b981" :
    plan.completionPct >= 50  ? "#3b82f6" : "#f59e0b";

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 text-white rounded-2xl p-5 sm:p-6 space-y-5">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-400">{greeting()}</p>
          <h2 className="text-xl font-bold mt-0.5 tracking-tight">Today&apos;s Mission</h2>
        </div>
        {plan.streak > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center gap-0.5 bg-white/10 rounded-xl px-3 py-2">
            <span className="text-xl leading-none">🔥</span>
            <span className="text-xs font-bold text-amber-300 tabular-nums">{plan.streak}d</span>
            <span className="text-[10px] text-gray-400">streak</span>
          </div>
        )}
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Applications today</span>
          <span className="font-bold tabular-nums">
            {plan.appliedToday}
            <span className="text-gray-500 font-normal"> / {plan.targetToday}</span>
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${plan.completionPct}%`, background: barColor }}
          />
        </div>
        <p className="text-xs text-gray-400">
          {plan.completionPct >= 100
            ? "🎉 Daily goal complete! Great work."
            : `${plan.completionPct}% of today's goal · ${plan.targetToday - plan.appliedToday} remaining`}
        </p>
      </div>

      {/* ── Info grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Focus roles */}
        {plan.focusRoles.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              🎯 Focus Roles
            </p>
            <div className="space-y-2">
              {plan.focusRoles.map((r, i) => (
                <div key={r.keyword} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={[
                      "text-xs font-bold w-4 text-center flex-shrink-0",
                      i === 0 ? "text-amber-400" : i === 1 ? "text-gray-400" : "text-gray-600"
                    ].join(" ")}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-white capitalize truncate">{r.keyword}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-gray-500">{r.count}×</span>
                    <span className={[
                      "text-xs font-bold px-1.5 py-0.5 rounded-full",
                      r.avgScore >= 80 ? "bg-emerald-500/25 text-emerald-300" :
                      r.avgScore >= 65 ? "bg-blue-500/25 text-blue-300"    :
                      "bg-gray-500/25 text-gray-300",
                    ].join(" ")}>
                      {r.avgScore}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Right column: skill tip + avoid */}
        <div className="space-y-3">
          {plan.topSkillTip && (
            <div className="bg-white/8 rounded-xl p-3 space-y-1.5 border border-white/10">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                📚 Skill Tip
              </p>
              <p className="text-sm font-semibold text-white">{plan.topSkillTip}</p>
              <p className="text-xs text-gray-400">
                Missing in {plan.skillTipFrequency} job
                {plan.skillTipFrequency !== 1 ? "s" : ""} you&apos;ve applied to
              </p>
            </div>
          )}

          {plan.avoidPlatforms.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                ⚠️ Low-return platforms
              </p>
              <div className="flex flex-wrap gap-1.5">
                {plan.avoidPlatforms.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/20"
                  >
                    {platformLabel(p)}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500">0% reply rate with 5+ applications</p>
            </div>
          )}

          {!plan.topSkillTip && plan.avoidPlatforms.length === 0 && (
            <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
              <p className="text-xs font-semibold text-emerald-400">All systems go 🚀</p>
              <p className="text-xs text-gray-400 mt-1">
                No skill gaps or underperforming platforms detected yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
