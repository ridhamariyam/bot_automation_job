"use client";

import { apiFetch } from "./api";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Outcome = "reply" | "interview" | "offer" | "rejected";

export type ScoredJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  platform: string;
  job_url?: string;
  status: string;
  applied_at: string;
  proof?: string;
  score?: number;
  score_breakdown?: string;
  outcome?: Outcome;
  has_cover_letter?: boolean;
  has_tailored_resume?: boolean;
};

export type Suggestion = {
  type: "skill_gap" | "platform" | "mode" | "tracking" | "title";
  priority: "high" | "medium" | "low";
  icon: string;
  title: string;
  detail: string;
  action?: string;
};

export type SuggestionsData = {
  suggestions: Suggestion[];
  skill_gaps: { skill: string; frequency: number }[];
  platform_stats: {
    platform: string;
    applied: number;
    replied: number;
    interviewed: number;
    reply_rate: number;
    avg_score: number | null;
  }[];
  avg_score: number | null;
  total_analyzed: number;
};

export type ScoringMode = "aggressive" | "balanced" | "high_quality";

export type ScoringConfig = {
  mode: ScoringMode;
  base_threshold: number;
  threshold_override?: number;
  adaptive_enabled: boolean;
  threshold_adjustment: number;
  effective_threshold: number;
  platform_limits: Record<string, number>;
  updated_at?: string;
};

export type AdaptiveStats = {
  user_email: string;
  mode: string;
  base_threshold: number;
  threshold_adjustment: number;
  effective_threshold: number;
  applied_30d: number;
  replied_30d: number;
  interviewed_30d: number;
  success_rate_pct: number;
  direction: "increasing" | "decreasing" | "stable";
  recommendation: string;
};

export type JobStats = {
  total: number;
  by_status: Record<string, number>;
  by_platform: Record<string, number>;
};

// ── API calls ──────────────────────────────────────────────────────────────────

export async function fetchJobs(email: string): Promise<ScoredJob[]> {
  return apiFetch<ScoredJob[]>(`/api/jobs/${encodeURIComponent(email)}`);
}

export async function fetchJobStats(email: string): Promise<JobStats> {
  return apiFetch<JobStats>(`/api/jobs/stats/${encodeURIComponent(email)}`);
}

export async function fetchScoringConfig(email: string): Promise<ScoringConfig> {
  return apiFetch<ScoringConfig>(`/api/scoring/config/${encodeURIComponent(email)}`);
}

export async function updateScoringConfig(
  email: string,
  updates: Record<string, unknown>
): Promise<ScoringConfig> {
  return apiFetch<ScoringConfig>(`/api/scoring/config/${encodeURIComponent(email)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function fetchAdaptiveStats(email: string): Promise<AdaptiveStats> {
  return apiFetch<AdaptiveStats>(`/api/scoring/stats/${encodeURIComponent(email)}`);
}

export async function recordOutcome(jobId: string, outcome: Outcome): Promise<void> {
  await apiFetch(`/api/scoring/outcome/${jobId}`, {
    method: "POST",
    body: JSON.stringify({ outcome }),
  });
}

export async function fetchSuggestions(email: string): Promise<SuggestionsData> {
  return apiFetch<SuggestionsData>(`/api/scoring/suggestions/${encodeURIComponent(email)}`);
}

export type ScoreJobIn = {
  user_email: string;
  job_title: string;
  company: string;
  description: string;
  job_url?: string;
};

export type ScoreJobOut = {
  total: number;
  title_score: number;
  skills_score: number;
  experience_score: number;
  relevance_score: number;
  quality_score: number;
  matched_skills: string[];
  missing_skills: string[];
  reasoning: string;
  experience_required: string | null;
  scorer: string;
  should_apply: boolean;
  effective_threshold: number;
  decision_reason: string;
  mode: string;
};

export async function scoreJob(data: ScoreJobIn): Promise<ScoreJobOut> {
  return apiFetch<ScoreJobOut>("/api/scoring/score", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Outcome Intelligence ───────────────────────────────────────────────────────

export type ScoreRangeStat = {
  range: string;
  label: string;
  applied: number;
  replied: number;
  rate: number;
};

export type IntelPlatformStat = {
  platform: string;
  applied: number;
  replied: number;
  rate: number;
  avg_score: number | null;
};

export type RoleStat = {
  role: string;
  applied: number;
  replied: number;
  rate: number;
  avg_score: number | null;
};

export type IntelPattern = {
  dimension: string;
  label: string;
  rate: number;
  applied: number;
  positive: boolean;
};

export type RejectionReason = {
  type: string;
  label: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  top_gaps: string[];
};

export type WeeklyPoint = {
  week: string;
  label: string;
  applied: number;
  replied: number;
  reply_rate: number;
  avg_score: number | null;
};

export type OutcomeIntelligence = {
  patterns: {
    by_score_range: ScoreRangeStat[];
    by_platform: IntelPlatformStat[];
    by_role: RoleStat[];
    top_patterns: IntelPattern[];
    worst_patterns: IntelPattern[];
  };
  optimization: {
    ideal_threshold: number;
    best_platform: string;
    best_role: string;
    threshold_rationale: string;
    platform_rationale: string;
    role_rationale: string;
  };
  rejection: {
    primary_reason: string;
    reasons: RejectionReason[];
  };
  progression: {
    weeks: WeeklyPoint[];
    trend_score: "improving" | "declining" | "stable" | "insufficient";
    trend_rate: "improving" | "declining" | "stable" | "insufficient";
  };
  total_analyzed: number;
  with_outcomes: number;
  has_enough_data: boolean;
};

export async function fetchOutcomeIntelligence(email: string): Promise<OutcomeIntelligence> {
  return apiFetch<OutcomeIntelligence>(
    `/api/scoring/outcome-intelligence/${encodeURIComponent(email)}`
  );
}
