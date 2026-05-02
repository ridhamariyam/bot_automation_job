"use client";

import type { WeeklyPoint } from "../lib/useScoringAPI";

// ── Helpers ────────────────────────────────────────────────────────────────────

function barColor(rate: number): string {
  if (rate >= 15) return "#10b981";
  if (rate >= 8)  return "#3b82f6";
  if (rate >= 3)  return "#f59e0b";
  return "#e5e7eb";
}

function trendBadge(trend: string) {
  const map: Record<string, { label: string; cls: string }> = {
    improving:   { label: "↑ Improving",   cls: "bg-emerald-100 text-emerald-700" },
    declining:   { label: "↓ Declining",   cls: "bg-red-100 text-red-600"         },
    stable:      { label: "→ Stable",      cls: "bg-gray-100 text-gray-600"       },
    insufficient: { label: "Not enough data", cls: "bg-gray-100 text-gray-400"    },
  };
  const cfg = map[trend] ?? map.insufficient;
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Bar chart ──────────────────────────────────────────────────────────────────

function WeekBar({ point, maxApplied }: { point: WeeklyPoint; maxApplied: number }) {
  const heightPct = maxApplied > 0 ? Math.max(8, Math.round((point.applied / maxApplied) * 100)) : 8;
  const color = barColor(point.reply_rate);

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0 group">
      {/* Count label */}
      <span className="text-[10px] text-gray-400 tabular-nums leading-none h-3">
        {point.applied}
      </span>

      {/* Bar */}
      <div className="w-full flex items-end" style={{ height: 64 }}>
        <div
          className="w-full rounded-t-md transition-all duration-500 relative"
          style={{ height: `${heightPct}%`, background: color }}
          title={`${point.label}: ${point.applied} applied, ${point.reply_rate}% reply rate`}
        >
          {/* Replied dot at top */}
          {point.replied > 0 && (
            <div
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white border"
              style={{ borderColor: color }}
            />
          )}
        </div>
      </div>

      {/* Rate label */}
      <span
        className="text-[10px] tabular-nums leading-none font-medium"
        style={{ color: point.reply_rate > 0 ? color : "#9ca3af" }}
      >
        {point.reply_rate > 0 ? `${point.reply_rate}%` : "—"}
      </span>

      {/* Week label */}
      <span className="text-[9px] text-gray-400 leading-none text-center truncate w-full px-0.5">
        {point.label}
      </span>
    </div>
  );
}

// ── Score sparkline ────────────────────────────────────────────────────────────

function ScoreLine({ weeks }: { weeks: WeeklyPoint[] }) {
  const scores = weeks.map((w) => w.avg_score).filter((s): s is number => s !== null);
  if (scores.length < 2) return null;
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const range = max - min || 1;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Avg Score per Week</p>
      <div className="flex items-end gap-1 h-12">
        {weeks.map((w) => {
          if (w.avg_score === null) {
            return <div key={w.week} className="flex-1 h-1 bg-gray-100 rounded self-center" />;
          }
          const pct = Math.max(10, Math.round(((w.avg_score - min) / range) * 100));
          const scoreColor =
            w.avg_score >= 80 ? "#10b981" :
            w.avg_score >= 65 ? "#3b82f6" :
            w.avg_score >= 50 ? "#f59e0b" : "#ef4444";
          return (
            <div key={w.week} className="flex-1 flex flex-col items-center justify-end" style={{ height: 48 }}>
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${pct}%`, background: scoreColor, opacity: 0.7 }}
                title={`${w.label}: avg score ${w.avg_score}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-3">
      {[
        { color: "#10b981", label: "≥15% reply" },
        { color: "#3b82f6", label: "8–14%"      },
        { color: "#f59e0b", label: "3–7%"        },
        { color: "#e5e7eb", label: "0–2%"        },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
          <span className="text-[11px] text-gray-500">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = {
  weeks:      WeeklyPoint[];
  trendScore: string;
  trendRate:  string;
};

export function ProgressionChart({ weeks, trendScore, trendRate }: Props) {
  if (weeks.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Progression</h3>
        <div className="text-center py-10 space-y-2">
          <p className="text-2xl">📈</p>
          <p className="text-sm text-gray-500">No weekly data yet. Start applying to see trends.</p>
        </div>
      </div>
    );
  }

  const maxApplied = Math.max(...weeks.map((w) => w.applied), 1);
  const totalApplied = weeks.reduce((s, w) => s + w.applied, 0);
  const totalReplied = weeks.reduce((s, w) => s + w.replied, 0);
  const overallRate = totalApplied > 0 ? ((totalReplied / totalApplied) * 100).toFixed(1) : "0";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900">Progression</h3>
          <p className="text-sm text-gray-500 mt-0.5">Last {weeks.length} weeks · bar height = volume, color = reply rate</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-right">
            <p className="text-xs text-gray-400">Reply rate</p>
            {trendBadge(trendRate)}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Avg score</p>
            {trendBadge(trendScore)}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{totalApplied}</p>
          <p className="text-xs text-gray-400">applications</p>
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">{overallRate}%</p>
          <p className="text-xs text-gray-400">reply rate</p>
        </div>
      </div>

      {/* Bar chart — application volume */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Weekly Applications &amp; Reply Rate
        </p>
        <div className="flex items-end gap-1">
          {weeks.map((w) => (
            <WeekBar key={w.week} point={w} maxApplied={maxApplied} />
          ))}
        </div>
      </div>

      {/* Score mini chart */}
      <ScoreLine weeks={weeks} />

      {/* Legend */}
      <div className="border-t border-gray-100 pt-3">
        <Legend />
      </div>
    </div>
  );
}
