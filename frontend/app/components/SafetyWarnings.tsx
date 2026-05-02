"use client";

import { useMemo } from "react";
import type { ScoredJob } from "../lib/useScoringAPI";

type Warning = {
  id: string;
  level: "amber" | "red" | "blue";
  icon: string;
  title: string;
  message: string;
};

function computeWarnings(jobs: ScoredJob[]): Warning[] {
  const warnings: Warning[] = [];
  if (jobs.length === 0) return warnings;

  // ── High volume today ──────────────────────────────────────────────────────
  const todayStr = new Date().toDateString();
  const todayCount = jobs.filter(
    (j) => new Date(j.applied_at).toDateString() === todayStr
  ).length;

  if (todayCount >= 150) {
    warnings.push({
      id: "high-volume",
      level: "red",
      icon: "⚠️",
      title: "Very high application volume today",
      message: `You've applied to ${todayCount} jobs today. High-volume applications often get flagged as spam by platforms. Consider pausing and letting your profile breathe.`,
    });
  } else if (todayCount >= 80) {
    warnings.push({
      id: "high-volume",
      level: "amber",
      icon: "📊",
      title: `High volume: ${todayCount} applications today`,
      message: "Applying to too many jobs per day reduces per-application quality. Consider setting a tighter score threshold in Settings.",
    });
  }

  // ── Low reply rate ─────────────────────────────────────────────────────────
  const withOutcome = jobs.filter((j) => j.outcome);
  if (jobs.length >= 25 && withOutcome.length >= 15) {
    const replied = withOutcome.filter((j) =>
      ["reply", "interview", "offer"].includes(j.outcome ?? "")
    ).length;
    const replyRate = (replied / withOutcome.length) * 100;

    if (replyRate < 3 && withOutcome.length >= 20) {
      warnings.push({
        id: "low-reply-rate",
        level: "amber",
        icon: "📉",
        title: `Low reply rate: ${replyRate.toFixed(1)}%`,
        message: "Less than 3% of tracked applications are getting replies. Check the Intelligence tab for targeted suggestions on what to improve.",
      });
    }
  }

  // ── No outcomes tracked ────────────────────────────────────────────────────
  if (jobs.length >= 20 && withOutcome.length === 0) {
    warnings.push({
      id: "no-outcomes",
      level: "blue",
      icon: "📋",
      title: "Track your outcomes to unlock AI insights",
      message: `You have ${jobs.length} applications with no outcomes recorded. Click any job card and mark it as Replied, Interview, or Rejected — this activates adaptive scoring.`,
    });
  }

  return warnings;
}

const LEVEL_STYLES: Record<string, string> = {
  red:   "bg-red-50 border-red-200 text-red-900",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  blue:  "bg-blue-50 border-blue-200 text-blue-900",
};
const LEVEL_MSG_STYLES: Record<string, string> = {
  red:   "text-red-700",
  amber: "text-amber-700",
  blue:  "text-blue-700",
};

type Props = { jobs: ScoredJob[] };

export function SafetyWarnings({ jobs }: Props) {
  const warnings = useMemo(() => computeWarnings(jobs), [jobs]);

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <div
          key={w.id}
          className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${LEVEL_STYLES[w.level]}`}
        >
          <span className="text-base leading-none mt-0.5 flex-shrink-0">{w.icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{w.title}</p>
            <p className={`text-xs mt-0.5 leading-relaxed ${LEVEL_MSG_STYLES[w.level]}`}>
              {w.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
