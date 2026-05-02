"use client";

import { useMemo } from "react";
import type { ScoredJob } from "../lib/useScoringAPI";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScoreBreakdown = {
  matched_skills: string[];
  missing_skills: string[];
  skills_score: number;
};

type SkillImpact = {
  skill: string;
  affectedJobs: number;
  avgBoost: number;
  jobsCrossingThreshold: number;
  priority: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseBreakdown(raw?: string): ScoreBreakdown | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function computeImpacts(jobs: ScoredJob[], threshold: number): SkillImpact[] {
  const parsed = jobs
    .filter((j) => j.score != null && j.score_breakdown)
    .map((j) => ({ job: j, bd: parseBreakdown(j.score_breakdown)! }))
    .filter(({ bd }) => bd != null);

  if (parsed.length === 0) return [];

  // Collect unique missing skills
  const skillSet = new Set<string>();
  for (const { bd } of parsed) {
    for (const s of bd.missing_skills) skillSet.add(s);
  }

  const results: SkillImpact[] = [];

  for (const skill of skillSet) {
    const affected = parsed.filter(({ bd }) => bd.missing_skills.includes(skill));
    if (affected.length < 2) continue;

    let totalBoost = 0;
    let crossThreshold = 0;

    for (const { job, bd } of affected) {
      const totalSkills = bd.matched_skills.length + bd.missing_skills.length;
      if (totalSkills === 0) continue;

      // Re-estimate skills_score after adding this skill
      const newMatchFrac = (bd.matched_skills.length + 1) / totalSkills;
      const newSkillsScore = Math.round(newMatchFrac * 35);
      const boost = Math.max(0, newSkillsScore - bd.skills_score);
      totalBoost += boost;

      const currentScore = job.score ?? 0;
      if (currentScore < threshold && currentScore + boost >= threshold) {
        crossThreshold++;
      }
    }

    const avgBoost = Math.round(totalBoost / affected.length);
    results.push({
      skill,
      affectedJobs: affected.length,
      avgBoost,
      jobsCrossingThreshold: crossThreshold,
      // Priority = weighted by both boost magnitude and job count
      priority: avgBoost * Math.log2(affected.length + 1),
    });
  }

  return results.sort((a, b) => b.priority - a.priority).slice(0, 7);
}

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  jobs: ScoredJob[];
  threshold: number;
};

export function SkillImpactSimulator({ jobs, threshold }: Props) {
  const impacts = useMemo(
    () => computeImpacts(jobs, threshold),
    [jobs, threshold]
  );

  const withBreakdowns = jobs.filter((j) => j.score_breakdown).length;

  if (withBreakdowns < 5) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 text-center space-y-3">
        <p className="text-3xl">🧪</p>
        <p className="font-semibold text-gray-900">Not enough data</p>
        <p className="text-sm text-gray-500 max-w-xs mx-auto">
          Apply to at least 5 jobs with score breakdowns to run the skill impact analysis.
        </p>
      </div>
    );
  }

  if (impacts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 text-center space-y-3">
        <p className="text-3xl">✅</p>
        <p className="font-semibold text-gray-900">No significant skill gaps found</p>
        <p className="text-sm text-gray-500">Your profile matches the jobs you&apos;re applying to well.</p>
      </div>
    );
  }

  const maxPriority = impacts[0].priority;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">

      {/* Header */}
      <div>
        <h3 className="font-semibold text-gray-900">Skill Impact Simulator</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Estimated score boost if you add each skill to your profile.
        </p>
      </div>

      {/* Impact bars */}
      <div className="space-y-4">
        {impacts.map((impact, i) => {
          const barPct = maxPriority > 0
            ? Math.round((impact.priority / maxPriority) * 100)
            : 0;

          return (
            <div key={impact.skill} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Left: rank + skill name + threshold badge */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-semibold text-gray-900 text-sm">{impact.skill}</span>
                  {impact.jobsCrossingThreshold > 0 && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0 whitespace-nowrap">
                      +{impact.jobsCrossingThreshold} qualify
                    </span>
                  )}
                </div>

                {/* Right: affected count + avg boost */}
                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  <span className="text-xs text-gray-400">{impact.affectedJobs} jobs</span>
                  <span className="text-sm font-bold text-blue-600 tabular-nums">
                    +{impact.avgBoost} pts avg
                  </span>
                </div>
              </div>

              {/* Impact bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${barPct}%`,
                      background: i === 0 ? "#3b82f6" : i === 1 ? "#6366f1" : "#8b5cf6",
                    }}
                  />
                </div>
              </div>

              {/* Tooltip-style note for top impact */}
              {i === 0 && impact.avgBoost >= 3 && (
                <p className="text-xs text-gray-400 ml-5">
                  Highest ROI skill — affects {impact.affectedJobs} jobs
                  {impact.jobsCrossingThreshold > 0
                    ? `, pushing ${impact.jobsCrossingThreshold} past your ≥${threshold} threshold`
                    : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
        Analysis based on {withBreakdowns} applications with score breakdowns.
        Boost is estimated by adding the skill to matched set and recalculating skills component (max 35 pts).
      </p>
    </div>
  );
}
