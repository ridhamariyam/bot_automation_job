import { useMemo } from "react";
import type { ScoredJob } from "../lib/useScoringAPI";

// ── Helpers ────────────────────────────────────────────────────────────────────

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() + diff);
  return m;
}

function isInWeek(isoStr: string, start: Date, end: Date): boolean {
  const t = new Date(isoStr).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function computeWeekStats(weekJobs: ScoredJob[]) {
  const replied     = weekJobs.filter((j) => ["reply", "interview", "offer"].includes(j.outcome ?? "")).length;
  const interviewed = weekJobs.filter((j) => j.outcome === "interview" || j.outcome === "offer").length;
  const scored      = weekJobs.filter((j) => j.score != null);
  const avgScore    = scored.length > 0
    ? Math.round(scored.reduce((s, j) => s + (j.score ?? 0), 0) / scored.length)
    : null;
  const replyRate   = weekJobs.length > 0 ? +((replied / weekJobs.length) * 100).toFixed(1) : 0;

  // Best platform by reply rate
  const plat: Record<string, { applied: number; replied: number }> = {};
  for (const j of weekJobs) {
    if (!plat[j.platform]) plat[j.platform] = { applied: 0, replied: 0 };
    plat[j.platform].applied++;
    if (j.outcome === "reply" || j.outcome === "interview" || j.outcome === "offer") plat[j.platform].replied++;
  }
  let bestPlatform = "";
  let bestRate = -1;
  for (const [p, s] of Object.entries(plat)) {
    if (s.applied >= 3) {
      const r = s.replied / s.applied;
      if (r > bestRate) { bestRate = r; bestPlatform = p; }
    }
  }

  // Top skill gap
  const skillFreq: Record<string, number> = {};
  for (const j of weekJobs) {
    if (!j.score_breakdown) continue;
    try {
      const bd = JSON.parse(j.score_breakdown) as { missing_skills?: string[] };
      for (const s of bd.missing_skills ?? []) {
        skillFreq[s] = (skillFreq[s] ?? 0) + 1;
      }
    } catch { /* ignore */ }
  }
  const topSkillGap = Object.entries(skillFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { applications: weekJobs.length, replied, interviewed, replyRate, avgScore, bestPlatform, topSkillGap };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export type WeekStats = {
  applications: number;
  replied: number;
  interviewed: number;
  replyRate: number;
  avgScore: number | null;
  bestPlatform: string;
  topSkillGap: string | null;
};

export type WeeklyReportResult = {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  deltaApplications: number;
  deltaReplyRate: number;
  deltaAvgScore: number | null;
};

export function useWeeklyReport(jobs: ScoredJob[]): WeeklyReportResult {
  return useMemo(() => {
    const now       = new Date();
    const thisStart = mondayOf(now);
    const lastStart = new Date(thisStart);
    lastStart.setDate(lastStart.getDate() - 7);
    const thisEnd   = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 7);

    const thisWeekJobs = jobs.filter((j) => isInWeek(j.applied_at, thisStart, thisEnd));
    const lastWeekJobs = jobs.filter((j) => isInWeek(j.applied_at, lastStart, thisStart));

    const thisWeek = computeWeekStats(thisWeekJobs);
    const lastWeek = computeWeekStats(lastWeekJobs);

    const deltaApplications = thisWeek.applications - lastWeek.applications;
    const deltaReplyRate    = +(thisWeek.replyRate - lastWeek.replyRate).toFixed(1);
    const deltaAvgScore     =
      thisWeek.avgScore != null && lastWeek.avgScore != null
        ? thisWeek.avgScore - lastWeek.avgScore
        : null;

    return { thisWeek, lastWeek, deltaApplications, deltaReplyRate, deltaAvgScore };
  }, [jobs]);
}
