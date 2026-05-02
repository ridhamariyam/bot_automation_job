"use client";

import type { XPResult } from "../hooks/useXP";

// ── Compact header bar ─────────────────────────────────────────────────────────

export function XPBarCompact({ xp }: { xp: XPResult }) {
  return (
    <div className="hidden md:flex items-center gap-2.5 select-none">
      <span className="text-base leading-none" title={xp.levelName}>
        {xp.levelEmoji}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{xp.levelName}</span>
          {!xp.isMaxLevel && (
            <span className="text-[10px] text-gray-400 tabular-nums">
              {xp.currentLevelXP}/{xp.nextLevelXP} XP
            </span>
          )}
        </div>
        <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${xp.progressPct}%`,
              background: xp.isMaxLevel ? "#f59e0b" : "#3b82f6",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Full card for Today tab ────────────────────────────────────────────────────

export function XPCard({ xp }: { xp: XPResult }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Your Progress</h3>
          <p className="text-sm text-gray-500 mt-0.5">XP earned through consistent applying</p>
        </div>
        <div className="text-4xl leading-none">{xp.levelEmoji}</div>
      </div>

      {/* Level + bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-gray-900">{xp.levelName}</span>
          <span className="text-sm text-gray-500 tabular-nums">{xp.totalXP} XP total</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${xp.progressPct}%`,
              background: xp.isMaxLevel
                ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                : "linear-gradient(90deg,#3b82f6,#6366f1)",
            }}
          />
        </div>
        {!xp.isMaxLevel ? (
          <p className="text-xs text-gray-400">
            {xp.currentLevelXP} / {xp.nextLevelXP} XP to next level
          </p>
        ) : (
          <p className="text-xs text-amber-500 font-semibold">Max level reached!</p>
        )}
      </div>

      {/* XP breakdown */}
      <div className="grid grid-cols-3 gap-3 pt-1">
        {[
          { label: "Applications", value: xp.applyXP,   note: "10 XP each",    color: "text-blue-600" },
          { label: "Outcomes",     value: xp.outcomeXP,  note: "50–300 XP",     color: "text-emerald-600" },
          { label: "Streak",       value: xp.streakXP,   note: "5 XP/day",      color: "text-orange-500" },
        ].map(({ label, value, note, color }) => (
          <div key={label} className="text-center bg-gray-50 rounded-xl py-2.5 px-2">
            <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            <p className="text-[10px] text-gray-400">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
