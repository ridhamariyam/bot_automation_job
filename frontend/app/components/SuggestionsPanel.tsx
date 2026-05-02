"use client";

import { useMemo } from "react";
import type { ScoredJob, ScoringConfig } from "../lib/useScoringAPI";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScoreBreakdown = {
  matched_skills: string[];
  missing_skills: string[];
};

type Suggestion = {
  type: string;
  priority: "high" | "medium" | "low";
  icon: string;
  title: string;
  detail: string;
  action?: string;
};

type Props = {
  jobs: ScoredJob[];
  config: ScoringConfig | null;
  loading: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseBreakdown(raw?: string): ScoreBreakdown | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeSuggestions(jobs: ScoredJob[], config: ScoringConfig | null): Suggestion[] {
  const out: Suggestion[] = [];

  // ── 1. Skill gap analysis ────────────────────────────────────────────────
  const skillFreq: Record<string, number> = {};
  for (const j of jobs) {
    const bd = parseBreakdown(j.score_breakdown);
    if (!bd) continue;
    for (const s of bd.missing_skills) {
      skillFreq[s] = (skillFreq[s] ?? 0) + 1;
    }
  }
  const topSkills = Object.entries(skillFreq).sort(([, a], [, b]) => b - a);

  if (topSkills.length > 0) {
    const [top, freq] = topSkills[0];
    out.push({
      type: "skill",
      priority: freq >= 5 ? "high" : "medium",
      icon: "🎯",
      title: `Add "${top}" to your profile`,
      detail: `Appears as a missing skill in ${freq} of your recent applications. Adding it could raise your scores by 5–15 points.`,
      action: "Go to Settings → Profile to update your skills",
    });
  }

  if (topSkills.length > 1) {
    const others = topSkills.slice(1, 4).map(([s]) => s).join(", ");
    out.push({
      type: "skill",
      priority: "medium",
      icon: "📚",
      title: `Also consider adding: ${others}`,
      detail: "These skills appear frequently in jobs you're targeting but aren't on your profile.",
    });
  }

  // ── 2. Platform performance ──────────────────────────────────────────────
  const plat: Record<string, { applied: number; replied: number }> = {};
  for (const j of jobs) {
    const p = j.platform;
    if (!plat[p]) plat[p] = { applied: 0, replied: 0 };
    plat[p].applied++;
    if (j.outcome === "reply" || j.outcome === "interview" || j.outcome === "offer") {
      plat[p].replied++;
    }
  }
  const platList = Object.entries(plat)
    .filter(([, v]) => v.applied >= 3)
    .map(([p, v]) => ({ p, rate: v.replied / v.applied, ...v }))
    .sort((a, b) => b.rate - a.rate);

  if (platList.length > 0 && platList[0].rate > 0) {
    const best = platList[0];
    out.push({
      type: "platform",
      priority: "medium",
      icon: "🚀",
      title: `${titleCase(best.p)} has your best reply rate`,
      detail: `${Math.round(best.rate * 100)}% reply rate (${best.replied}/${best.applied} responded). Consider raising your daily limit here.`,
      action: "Adjust in Settings → Daily Application Limits",
    });
  }

  const zeroPlats = platList.filter((v) => v.rate === 0 && v.applied >= 5);
  if (zeroPlats.length > 0) {
    const w = zeroPlats[0];
    out.push({
      type: "platform",
      priority: "low",
      icon: "📉",
      title: `${titleCase(w.p)} has 0% reply rate`,
      detail: `${w.applied} applications, no responses. Consider reducing or disabling this platform temporarily.`,
      action: "Set limit to 0 in Settings → Daily Application Limits",
    });
  }

  // ── 3. Score quality ─────────────────────────────────────────────────────
  const scored = jobs.filter((j) => j.score != null);
  const avgScore =
    scored.length > 0
      ? scored.reduce((s, j) => s + (j.score ?? 0), 0) / scored.length
      : null;

  if (avgScore !== null && avgScore < 60 && scored.length >= 10 && config?.mode !== "high_quality") {
    out.push({
      type: "mode",
      priority: "high",
      icon: "⚡",
      title: "Your job match quality is low",
      detail: `Average score is ${Math.round(avgScore)}/100. Switching to Balanced or High Quality mode filters for better matches and typically improves reply rates.`,
      action: "Change mode in Settings → Application Mode",
    });
  }

  if (avgScore !== null && avgScore >= 80 && config?.mode === "aggressive") {
    out.push({
      type: "mode",
      priority: "low",
      icon: "✅",
      title: "Jobs score well — you could tighten the filter",
      detail: `Average score is ${Math.round(avgScore)}/100 in Aggressive mode. Switching to Balanced reduces noise without cutting volume much.`,
      action: "Consider Balanced in Settings → Application Mode",
    });
  }

  // ── 4. Outcome tracking ──────────────────────────────────────────────────
  const withOutcome = jobs.filter((j) => j.outcome);
  if (jobs.length >= 15 && withOutcome.length === 0) {
    out.push({
      type: "tracking",
      priority: "high",
      icon: "📊",
      title: "Start tracking your outcomes",
      detail: `You have ${jobs.length} applications but no outcomes recorded. Tracking replies and interviews activates the adaptive scoring engine.`,
      action: "Click any job card and use the outcome buttons",
    });
  }

  // ── 5. Positive signal ───────────────────────────────────────────────────
  const replied = jobs.filter(
    (j) => j.outcome === "reply" || j.outcome === "interview" || j.outcome === "offer"
  );
  const replyRate = jobs.length > 0 ? replied.length / jobs.length : 0;
  if (replyRate >= 0.15 && replied.length >= 3) {
    out.push({
      type: "positive",
      priority: "low",
      icon: "🌟",
      title: `Strong reply rate: ${Math.round(replyRate * 100)}%`,
      detail: "You're getting above-average responses. The bot is finding good matches — keep applying!",
    });
  }

  return out;
}

// ── Priority styles ────────────────────────────────────────────────────────────

const PRIORITY: Record<string, { bar: string; badge: string; label: string }> = {
  high:   { bar: "border-l-[3px] border-amber-400",  badge: "bg-amber-100 text-amber-700",  label: "High" },
  medium: { bar: "border-l-[3px] border-blue-300",   badge: "bg-blue-100 text-blue-600",    label: "Medium" },
  low:    { bar: "border-l-[3px] border-gray-200",   badge: "bg-gray-100 text-gray-500",    label: "Low" },
};

// ── Component ──────────────────────────────────────────────────────────────────

export function SuggestionsPanel({ jobs, config, loading }: Props) {
  const { suggestions, skillGaps } = useMemo(() => {
    const s = computeSuggestions(jobs, config);

    const freq: Record<string, number> = {};
    for (const j of jobs) {
      const bd = parseBreakdown(j.score_breakdown);
      if (!bd) continue;
      for (const sk of bd.missing_skills) {
        freq[sk] = (freq[sk] ?? 0) + 1;
      }
    }
    const skillGaps = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return { suggestions: s, skillGaps };
  }, [jobs, config]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 h-24" />
        ))}
      </div>
    );
  }

  if (jobs.length < 5) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-12 text-center space-y-3">
        <p className="text-3xl">🤖</p>
        <p className="font-semibold text-gray-900">Not enough data yet</p>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Apply to at least 5 jobs to unlock personalized AI suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">AI Suggestions</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Derived from {jobs.length} applications
          </p>
        </div>
      </div>

      {/* Suggestion cards */}
      {suggestions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 text-center space-y-2">
          <p className="text-2xl">✅</p>
          <p className="font-semibold text-gray-900">Everything looks great!</p>
          <p className="text-sm text-gray-500">
            No suggestions right now. Keep tracking outcomes to improve adaptive scoring.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s, i) => {
            const p = PRIORITY[s.priority];
            return (
              <div
                key={i}
                className={[
                  "bg-white rounded-xl shadow-sm p-5 flex items-start gap-4 transition-shadow hover:shadow-md",
                  p.bar,
                ].join(" ")}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900 text-sm">{s.title}</h3>
                    <span
                      className={[
                        "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        p.badge,
                      ].join(" ")}
                    >
                      {p.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.detail}</p>
                  {s.action && (
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                      <svg
                        className="w-3 h-3 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 12 12"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {s.action}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Skill gap heatmap */}
      {skillGaps.length >= 3 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-1">Top Skill Gaps</h3>
          <p className="text-xs text-gray-400 mb-4">
            Skills in job descriptions that aren&apos;t on your profile
          </p>
          <div className="space-y-2.5">
            {skillGaps.map(([skill, count]) => {
              const max = skillGaps[0][1];
              const pct = Math.round((count / max) * 100);
              return (
                <div key={skill} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 font-medium w-36 flex-shrink-0 truncate">
                    {skill}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-red-400 transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums w-8 text-right">
                    {count}×
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
