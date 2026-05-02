import { useMemo } from "react";
import type { ScoredJob, ScoringConfig } from "../lib/useScoringAPI";

type ScoreBreakdown = { missing_skills: string[] };

function parseBreakdown(raw?: string): ScoreBreakdown | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const STOP_WORDS = new Set([
  "and", "the", "for", "with", "this", "that", "from", "have",
  "are", "was", "will", "your", "our", "team", "role", "work",
  "job", "jobs", "join", "help", "using", "into", "based",
]);

export type DailyPlan = {
  appliedToday: number;
  targetToday: number;
  completionPct: number;
  todayJobs: ScoredJob[];
  streak: number;
  focusRoles: { keyword: string; avgScore: number; count: number }[];
  avoidPlatforms: string[];
  topSkillTip: string | null;
  skillTipFrequency: number;
};

export function useDailyPlan(jobs: ScoredJob[], config: ScoringConfig | null): DailyPlan {
  return useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayJobs = jobs.filter((j) => {
      const d = new Date(j.applied_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime() >= todayStart.getTime();
    });
    const appliedToday = todayJobs.length;

    const targetToday = config
      ? Math.min(200, Math.max(10, Object.values(config.platform_limits).reduce((a, b) => a + b, 0)))
      : 50;

    // ── Streak ───────────────────────────────────────────────────────────────
    const appliedDays = new Set(
      jobs.map((j) => new Date(j.applied_at).toISOString().slice(0, 10))
    );
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (appliedDays.has(key)) {
        streak++;
      } else if (i === 0) {
        // Today not yet applied — don't break streak, check yesterday next
        continue;
      } else {
        break;
      }
    }

    // ── Focus roles — title keywords with highest avg score ──────────────────
    const titleScores: Record<string, number[]> = {};
    for (const j of jobs) {
      if (j.score == null) continue;
      const words = j.title
        .toLowerCase()
        .split(/[\s,/()\-–]+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
      for (const w of words) {
        if (!titleScores[w]) titleScores[w] = [];
        titleScores[w].push(j.score);
      }
    }
    const focusRoles = Object.entries(titleScores)
      .filter(([, scores]) => scores.length >= 2)
      .map(([keyword, scores]) => ({
        keyword,
        avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore || b.count - a.count)
      .slice(0, 3);

    // ── Avoid platforms — 0% reply rate with ≥5 apps ─────────────────────────
    const platMap: Record<string, { applied: number; replied: number }> = {};
    for (const j of jobs) {
      if (!platMap[j.platform]) platMap[j.platform] = { applied: 0, replied: 0 };
      platMap[j.platform].applied++;
      if (j.outcome === "reply" || j.outcome === "interview" || j.outcome === "offer") {
        platMap[j.platform].replied++;
      }
    }
    const avoidPlatforms = Object.entries(platMap)
      .filter(([, v]) => v.applied >= 5 && v.replied === 0)
      .map(([p]) => p);

    // ── Top skill tip ────────────────────────────────────────────────────────
    const skillFreq: Record<string, number> = {};
    for (const j of jobs) {
      const bd = parseBreakdown(j.score_breakdown);
      if (!bd) continue;
      for (const s of bd.missing_skills) {
        skillFreq[s] = (skillFreq[s] ?? 0) + 1;
      }
    }
    const topSkillEntry = Object.entries(skillFreq).sort(([, a], [, b]) => b - a)[0];

    return {
      appliedToday,
      targetToday,
      completionPct: targetToday > 0
        ? Math.min(100, Math.round((appliedToday / targetToday) * 100))
        : 0,
      todayJobs,
      streak,
      focusRoles,
      avoidPlatforms,
      topSkillTip: topSkillEntry?.[0] ?? null,
      skillTipFrequency: topSkillEntry?.[1] ?? 0,
    };
  }, [jobs, config]);
}
