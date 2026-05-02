"use client";

import { platformLabel } from "../lib/platforms";
import type {
  ScoreRangeStat,
  IntelPlatformStat,
  RoleStat,
  IntelPattern,
} from "../lib/useScoringAPI";

// ── Shared ─────────────────────────────────────────────────────────────────────

function rateColor(rate: number): string {
  if (rate >= 15) return "#10b981";
  if (rate >= 8)  return "#3b82f6";
  if (rate >= 3)  return "#f59e0b";
  return "#d1d5db";
}

function RateBar({ rate, maxRate }: { rate: number; maxRate: number }) {
  const pct = maxRate > 0 ? Math.round((rate / maxRate) * 100) : 0;
  return (
    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: rateColor(rate) }}
      />
    </div>
  );
}

function RateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 15 ? "text-emerald-700 bg-emerald-50" :
    rate >= 8  ? "text-blue-700 bg-blue-50"       :
    rate >= 3  ? "text-amber-700 bg-amber-50"      : "text-gray-400 bg-gray-50";
  return (
    <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full ${color} flex-shrink-0`}>
      {rate}%
    </span>
  );
}

// ── Score range section ────────────────────────────────────────────────────────

function ScoreRangeSection({ data }: { data: ScoreRangeStat[] }) {
  const maxRate = Math.max(...data.map((d) => d.rate), 1);
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">By Score Range</p>
      <div className="space-y-2.5">
        {data.map((r) => (
          <div key={r.range} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-700 w-14 flex-shrink-0">{r.label}</span>
                <span className="text-[11px] text-gray-400 tabular-nums">{r.applied} apps</span>
              </div>
              <RateBadge rate={r.rate} />
            </div>
            <RateBar rate={r.rate} maxRate={maxRate} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Platform section ───────────────────────────────────────────────────────────

function PlatformSection({ data }: { data: IntelPlatformStat[] }) {
  if (data.length === 0) return null;
  const maxRate = Math.max(...data.map((d) => d.rate), 1);
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">By Platform</p>
      <div className="space-y-2.5">
        {data.slice(0, 6).map((p) => (
          <div key={p.platform} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-700 truncate">
                  {platformLabel(p.platform)}
                </span>
                <span className="text-[11px] text-gray-400 tabular-nums">{p.applied}</span>
              </div>
              <RateBadge rate={p.rate} />
            </div>
            <RateBar rate={p.rate} maxRate={maxRate} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Role section ───────────────────────────────────────────────────────────────

function RoleSection({ data }: { data: RoleStat[] }) {
  if (data.length === 0) return null;
  const maxRate = Math.max(...data.map((d) => d.rate), 1);
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">By Role</p>
      <div className="space-y-2.5">
        {data.slice(0, 6).map((r) => (
          <div key={r.role} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-700 truncate capitalize">{r.role}</span>
                <span className="text-[11px] text-gray-400 tabular-nums">{r.applied}</span>
              </div>
              <RateBadge rate={r.rate} />
            </div>
            <RateBar rate={r.rate} maxRate={maxRate} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top / worst patterns ───────────────────────────────────────────────────────

function PatternList({ items, positive }: { items: IntelPattern[]; positive: boolean }) {
  if (items.length === 0) return null;
  const cls = positive
    ? "border-emerald-100 bg-emerald-50/60"
    : "border-red-100 bg-red-50/50";
  const badge = positive
    ? "bg-emerald-100 text-emerald-700"
    : "bg-red-100 text-red-600";
  const headingColor = positive ? "text-emerald-700" : "text-red-600";
  return (
    <div className={`rounded-xl border p-3.5 space-y-2 ${cls}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${headingColor}`}>
        {positive ? "✓ What's working" : "✗ What's not"}
      </p>
      <div className="space-y-1.5">
        {items.map((p) => (
          <div key={`${p.dimension}-${p.label}`} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] text-gray-400 capitalize w-12 flex-shrink-0">{p.dimension}</span>
              <span className="text-xs font-medium text-gray-800 truncate">{p.label}</span>
            </div>
            <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full flex-shrink-0 ${badge}`}>
              {p.rate}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = {
  byScoreRange: ScoreRangeStat[];
  byPlatform:   IntelPlatformStat[];
  byRole:       RoleStat[];
  topPatterns:  IntelPattern[];
  worstPatterns: IntelPattern[];
};

export function WhatWorksPanel({
  byScoreRange, byPlatform, byRole, topPatterns, worstPatterns,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-6">

      <div>
        <h3 className="font-semibold text-gray-900">What Works</h3>
        <p className="text-sm text-gray-500 mt-0.5">Reply rates across score ranges, platforms, and roles.</p>
      </div>

      {/* Top / worst summary */}
      {(topPatterns.length > 0 || worstPatterns.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PatternList items={topPatterns}  positive={true} />
          <PatternList items={worstPatterns} positive={false} />
        </div>
      )}

      {/* Dimension breakdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-1">
        <ScoreRangeSection data={byScoreRange} />
        <PlatformSection   data={byPlatform} />
        <RoleSection       data={byRole} />
      </div>
    </div>
  );
}
