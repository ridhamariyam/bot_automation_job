"use client";

import { useWeeklyReport } from "../hooks/useWeeklyReport";
import { platformLabel } from "../lib/platforms";
import type { ScoredJob } from "../lib/useScoringAPI";

function Delta({ value, unit = "" }: { value: number; unit?: string }) {
  if (value === 0) return <span className="text-xs text-gray-400">no change</span>;
  const positive = value > 0;
  return (
    <span className={`text-xs font-semibold ${positive ? "text-emerald-600" : "text-red-500"}`}>
      {positive ? "+" : ""}{value}{unit}
    </span>
  );
}

type StatBlockProps = { label: string; value: string | number; delta?: number; unit?: string };

function StatBlock({ label, value, delta, unit }: StatBlockProps) {
  return (
    <div className="text-center space-y-1">
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {delta !== undefined && <Delta value={delta} unit={unit} />}
    </div>
  );
}

type Props = { jobs: ScoredJob[] };

export function WeeklyReportCard({ jobs }: Props) {
  const report = useWeeklyReport(jobs);
  const { thisWeek, deltaApplications, deltaReplyRate, deltaAvgScore } = report;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">

      {/* Header */}
      <div>
        <h3 className="font-semibold text-gray-900">This Week</h3>
        <p className="text-sm text-gray-500 mt-0.5">Mon – today vs last week</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2">
        <StatBlock
          label="Applications"
          value={thisWeek.applications}
          delta={deltaApplications}
        />
        <StatBlock
          label="Replies"
          value={thisWeek.replied}
        />
        <StatBlock
          label="Reply rate"
          value={`${thisWeek.replyRate}%`}
          delta={deltaReplyRate}
          unit="%"
        />
        <StatBlock
          label="Avg score"
          value={thisWeek.avgScore ?? "—"}
          delta={deltaAvgScore ?? undefined}
        />
      </div>

      {/* Insights row */}
      {(thisWeek.bestPlatform || thisWeek.topSkillGap) && (
        <div className="flex flex-wrap gap-2 border-t border-gray-50 pt-4">
          {thisWeek.bestPlatform && (
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-3 py-1">
              <span className="text-xs font-semibold">Best platform:</span>
              <span className="text-xs">{platformLabel(thisWeek.bestPlatform)}</span>
            </div>
          )}
          {thisWeek.topSkillGap && (
            <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 rounded-full px-3 py-1">
              <span className="text-xs font-semibold">Top gap:</span>
              <span className="text-xs">{thisWeek.topSkillGap}</span>
            </div>
          )}
        </div>
      )}

      {/* No data */}
      {thisWeek.applications === 0 && (
        <p className="text-sm text-gray-400 text-center py-3">
          No applications this week yet — get started!
        </p>
      )}
    </div>
  );
}
