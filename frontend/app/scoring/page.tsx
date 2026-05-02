"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, logout } from "../lib/useAuth";
import {
  fetchJobs,
  fetchScoringConfig,
  fetchAdaptiveStats,
  type ScoredJob,
  type ScoringConfig,
  type AdaptiveStats,
  type ScoringMode,
  type Outcome,
} from "../lib/useScoringAPI";
import { ScoreBadge, ScoreLabel } from "../components/ScoreBadge";
import { OutcomeButtons } from "../components/OutcomeButtons";
import { ModeSelector } from "../components/ModeSelector";
import { PlatformLimits } from "../components/PlatformLimits";
import { StatCard } from "../components/StatCard";
import { JobDetailDrawer } from "../components/JobDetailDrawer";
import { SuggestionsPanel } from "../components/SuggestionsPanel";
import { DailyPlanCard } from "../components/DailyPlanCard";
import { ProgressTracker } from "../components/ProgressTracker";
import { MissedOpportunities } from "../components/MissedOpportunities";
import { SkillImpactSimulator } from "../components/SkillImpactSimulator";
import { XPBarCompact, XPCard } from "../components/XPBar";
import { SuccessToast } from "../components/SuccessToast";
import { WeeklyReportCard } from "../components/WeeklyReport";
import { NotificationSettings } from "../components/NotificationSettings";
import { WhatWorksPanel } from "../components/WhatWorksPanel";
import { OptimizationInsights } from "../components/OptimizationInsights";
import { RejectionAnalysis } from "../components/RejectionAnalysis";
import { ProgressionChart } from "../components/ProgressionChart";
import { useXP } from "../hooks/useXP";
import { useDailyPlan } from "../hooks/useDailyPlan";
import { useNotifications } from "../hooks/useNotifications";
import { useOutcomeIntelligence } from "../hooks/useOutcomeIntelligence";
import { platformColor, platformIcon, platformLabel } from "../lib/platforms";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab    = "today" | "jobs" | "analytics" | "suggestions" | "intelligence" | "settings";
type Filter = "all" | "strong" | "good" | "needs_reply" | "interviewed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",         label: "All" },
  { key: "strong",      label: "Score ≥80" },
  { key: "good",        label: "Score ≥65" },
  { key: "needs_reply", label: "Awaiting" },
  { key: "interviewed", label: "Interviews" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function outcomeChip(outcome?: Outcome): { label: string; cls: string } | null {
  if (!outcome) return null;
  const map: Record<Outcome, { label: string; cls: string }> = {
    reply:     { label: "Replied",   cls: "bg-blue-100 text-blue-700" },
    interview: { label: "Interview", cls: "bg-emerald-100 text-emerald-700" },
    offer:     { label: "Offer!",    cls: "bg-yellow-100 text-yellow-700" },
    rejected:  { label: "Rejected",  cls: "bg-gray-100 text-gray-500" },
  };
  return map[outcome] ?? null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function applyFilter(jobs: ScoredJob[], filter: Filter): ScoredJob[] {
  switch (filter) {
    case "strong":      return jobs.filter((j) => (j.score ?? 0) >= 80);
    case "good":        return jobs.filter((j) => (j.score ?? 0) >= 65);
    case "needs_reply": return jobs.filter((j) => !j.outcome && j.status === "Applied");
    case "interviewed": return jobs.filter((j) => j.outcome === "interview" || j.outcome === "offer");
    default:            return jobs;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AdaptiveBanner({ stats }: { stats: AdaptiveStats }) {
  if (stats.applied_30d < 5) return null;
  const dir = stats.direction;
  const icon = dir === "increasing" ? "↑" : dir === "decreasing" ? "↓" : "→";
  const cls  =
    dir === "increasing" ? "bg-amber-50 border-amber-200 text-amber-800" :
    dir === "decreasing" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
    "bg-blue-50 border-blue-200 text-blue-800";

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm ${cls}`}>
      <span className="text-base font-bold">{icon}</span>
      <span>
        <span className="font-semibold">Adaptive engine: </span>
        {stats.threshold_adjustment !== 0 && (
          <>{stats.threshold_adjustment > 0 ? "+" : ""}{stats.threshold_adjustment}pt &mdash; </>
        )}
        {stats.recommendation}
      </span>
    </div>
  );
}

function ScoreBarRow({
  label, value, max, color,
}: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round((value / max) * 100)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 tabular-nums w-10 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

function JobCard({
  job,
  onClick,
  onOutcome,
}: {
  job: ScoredJob;
  onClick: () => void;
  onOutcome: (id: string, outcome: Outcome) => void;
}) {
  const score = job.score ?? 0;
  const chip  = outcomeChip(job.outcome);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden group">
      {/* Clickable header area */}
      <button
        onClick={onClick}
        className="w-full text-left p-4 flex items-start gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded-xl"
      >
        {/* Score ring */}
        <div className="flex-shrink-0 flex flex-col items-center gap-0.5 mt-0.5">
          <ScoreBadge score={score} size="md" />
          <ScoreLabel score={score} />
        </div>

        {/* Job info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm leading-snug truncate">
                {job.title}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {job.company}
                {job.location && (
                  <span className="text-gray-400"> · {job.location}</span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {chip && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chip.cls}`}>
                  {chip.label}
                </span>
              )}
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                style={{ background: platformColor(job.platform) }}
                title={platformLabel(job.platform)}
              >
                {platformIcon(job.platform)}
              </div>
              <span className="text-xs text-gray-400">{fmtDate(job.applied_at)}</span>
            </div>
          </div>

          <p className="text-xs text-gray-300 group-hover:text-blue-400 transition-colors mt-2">
            Click for full breakdown →
          </p>
        </div>
      </button>

      {/* Outcome row */}
      <div className="px-4 pb-3 border-t border-gray-50 pt-2.5">
        <OutcomeButtons
          jobId={job.id}
          current={job.outcome}
          onRecorded={(outcome) => onOutcome(job.id, outcome)}
        />
      </div>
    </div>
  );
}

function PlatformTable({ jobs }: { jobs: ScoredJob[] }) {
  const rows = useMemo(() => {
    const m: Record<string, { applied: number; replied: number; interviewed: number; scores: number[] }> = {};
    for (const j of jobs) {
      const p = j.platform;
      if (!m[p]) m[p] = { applied: 0, replied: 0, interviewed: 0, scores: [] };
      m[p].applied++;
      if (j.outcome === "reply" || j.outcome === "interview" || j.outcome === "offer") m[p].replied++;
      if (j.outcome === "interview" || j.outcome === "offer") m[p].interviewed++;
      if (j.score != null) m[p].scores.push(j.score);
    }

    return Object.entries(m)
      .map(([platform, s]) => ({
        platform,
        applied: s.applied,
        replied: s.replied,
        interviewed: s.interviewed,
        replyRate: s.applied > 0 ? Math.round((s.replied / s.applied) * 100) : 0,
        avgScore: s.scores.length > 0
          ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length)
          : null,
      }))
      .sort((a, b) => b.replyRate - a.replyRate || b.applied - a.applied);
  }, [jobs]);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No platform data yet.</p>;
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[540px]">
        <thead>
          <tr className="border-b border-gray-100">
            {["Platform", "Applied", "Replied", "Interviews", "Reply %", "Avg Score"].map((h, i) => (
              <th
                key={h}
                className={[
                  "py-2 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide",
                  i === 0 ? "text-left" : "text-right",
                ].join(" ")}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => (
            <tr key={r.platform} className="hover:bg-gray-50/70 transition-colors">
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-white font-bold text-[10px]"
                    style={{ background: platformColor(r.platform) }}
                  >
                    {platformIcon(r.platform)}
                  </div>
                  <span className="font-medium text-gray-800">{platformLabel(r.platform)}</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{r.applied}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-blue-600 font-medium">{r.replied}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 font-medium">{r.interviewed}</td>
              <td className="py-2.5 px-3 text-right">
                <span
                  className={[
                    "tabular-nums font-semibold",
                    r.replyRate >= 10 ? "text-emerald-600" :
                    r.replyRate >= 5  ? "text-blue-600"   : "text-gray-400",
                  ].join(" ")}
                >
                  {r.replyRate}%
                </span>
              </td>
              <td className="py-2.5 px-3 text-right">
                {r.avgScore != null ? (
                  <span
                    className={[
                      "tabular-nums font-semibold",
                      r.avgScore >= 80 ? "text-emerald-600" :
                      r.avgScore >= 65 ? "text-blue-600"   :
                      r.avgScore >= 50 ? "text-amber-600"  : "text-red-500",
                    ].join(" ")}
                  >
                    {r.avgScore}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ScoringPage() {
  useAuth();
  const router = useRouter();

  const [email, setEmail]               = useState("");
  const [tab, setTab]                   = useState<Tab>("today");
  const [filter, setFilter]             = useState<Filter>("all");
  const [jobs, setJobs]                 = useState<ScoredJob[]>([]);
  const [config, setConfig]             = useState<ScoringConfig | null>(null);
  const [stats, setStats]               = useState<AdaptiveStats | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [search, setSearch]             = useState("");
  const [selectedJob, setSelectedJob]   = useState<ScoredJob | null>(null);
  const [toast, setToast]               = useState<Outcome | null>(null);

  const load = useCallback(async (e: string) => {
    setLoading(true);
    setError("");
    try {
      const [j, c, s] = await Promise.all([
        fetchJobs(e),
        fetchScoringConfig(e),
        fetchAdaptiveStats(e),
      ]);
      setJobs(Array.isArray(j) ? j : []);
      setConfig(c);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    if (!stored) { router.replace("/login"); return; }
    const u = JSON.parse(stored) as { email: string };
    setEmail(u.email);
    load(u.email);
  }, [router, load]);

  const plan   = useDailyPlan(jobs, config);
  const xp     = useXP(jobs, plan.streak);
  const notifs = useNotifications();
  const intel  = useOutcomeIntelligence(email);

  // Schedule daily reminder once after permissions granted
  useEffect(() => {
    if (notifs.permission === "granted") notifs.scheduleDailyReminder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs.permission]);

  function handleOutcome(id: string, outcome: Outcome) {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, outcome } : j)));
    setSelectedJob((prev) => (prev?.id === id ? { ...prev, outcome } : prev));
    if (outcome === "reply" || outcome === "interview" || outcome === "offer") {
      setToast(outcome);
    }
  }

  // ── Derived analytics ──────────────────────────────────────────────────────

  const scoredJobs    = jobs.filter((j) => j.score != null);
  const replied       = jobs.filter((j) => ["reply", "interview", "offer"].includes(j.outcome ?? ""));
  const interviewed   = jobs.filter((j) => j.outcome === "interview" || j.outcome === "offer");
  const avgScore      = scoredJobs.length > 0
    ? Math.round(scoredJobs.reduce((s, j) => s + (j.score ?? 0), 0) / scoredJobs.length)
    : null;
  const replyRate     = jobs.length > 0 ? ((replied.length / jobs.length) * 100).toFixed(1) : "—";
  const interviewRate = jobs.length > 0 ? ((interviewed.length / jobs.length) * 100).toFixed(1) : "—";

  const displayJobs = useMemo(() => {
    const filtered = applyFilter(jobs, filter);
    if (!search) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
    );
  }, [jobs, filter, search]);

  // ── Tab definitions ────────────────────────────────────────────────────────

  const TABS: { key: Tab; label: string }[] = [
    { key: "today",        label: "Today" },
    { key: "jobs",         label: `Jobs (${jobs.length})` },
    { key: "analytics",    label: "Analytics" },
    { key: "suggestions",  label: "Suggestions" },
    { key: "intelligence", label: "Intelligence" },
    { key: "settings",     label: "Settings" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 -ml-1 rounded-md hover:bg-gray-100"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                <path d="M10 12L6 8l4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <h1 className="font-bold text-gray-900 text-base">Smart Scoring</h1>
            {config && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 capitalize">
                {config.mode.replace("_", " ")} · ≥{config.effective_threshold}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <XPBarCompact xp={xp} />
            {avgScore != null && (
              <span className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500">
                <span className="font-bold text-gray-900 tabular-nums">{avgScore}</span>
                avg score
              </span>
            )}
            <button
              onClick={() => logout(router)}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            {error}
            <button
              onClick={() => email && load(email)}
              className="ml-auto text-xs font-semibold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Adaptive banner */}
        {stats && <AdaptiveBanner stats={stats} />}

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                if (key === "intelligence") intel.load();
              }}
              className={[
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap",
                tab === key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── TODAY TAB ──────────────────────────────────────────────────── */}
        {tab === "today" && (
          <div className="space-y-5">
            {loading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-56 bg-gray-200 rounded-2xl" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="h-52 bg-white rounded-2xl border border-gray-100" />
                  <div className="h-52 bg-white rounded-2xl border border-gray-100" />
                </div>
              </div>
            ) : (
              <>
                <DailyPlanCard jobs={jobs} config={config} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <XPCard xp={xp} />
                  <WeeklyReportCard jobs={jobs} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ProgressTracker jobs={jobs} config={config} />

                  {/* Quick nav to jobs tab */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
                    <h3 className="font-semibold text-gray-900">Quick Actions</h3>
                    <div className="space-y-2 flex-1">
                      <button
                        onClick={() => setTab("jobs")}
                        className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-700 transition-colors text-sm font-medium group"
                      >
                        <span>View all applications</span>
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 12l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setTab("suggestions")}
                        className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 transition-colors text-sm font-medium group"
                      >
                        <span>See AI suggestions</span>
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-emerald-500" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 12l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setTab("analytics")}
                        className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-purple-50 hover:text-purple-700 text-gray-700 transition-colors text-sm font-medium group"
                      >
                        <span>View analytics</span>
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-purple-500" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 12l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setTab("settings")}
                        className="w-full text-left flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors text-sm font-medium group"
                      >
                        <span>Adjust settings</span>
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                          <path d="M6 12l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <MissedOpportunities email={email} />
              </>
            )}
          </div>
        )}

        {/* ── JOBS TAB ───────────────────────────────────────────────────── */}
        {tab === "jobs" && (
          <div className="space-y-4">
            {/* Filters + search */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-1.5 flex-wrap">
                {FILTERS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={[
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                      filter === key
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search job or company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56 bg-white"
              />
            </div>

            {/* Skeleton */}
            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse flex gap-4"
                  >
                    <div className="w-14 h-14 rounded-full bg-gray-100 flex-shrink-0" />
                    <div className="flex-1 space-y-2.5 pt-1">
                      <div className="h-4 bg-gray-100 rounded w-1/2" />
                      <div className="h-3 bg-gray-100 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && displayJobs.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <p className="text-gray-400 text-sm">
                  {jobs.length === 0
                    ? "No applications yet. Start the bot to begin applying to jobs."
                    : "No jobs match the current filter."}
                </p>
              </div>
            )}

            {/* Job list */}
            {!loading && (
              <div className="space-y-3">
                {displayJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onClick={() => setSelectedJob(job)}
                    onOutcome={handleOutcome}
                  />
                ))}
              </div>
            )}

            {displayJobs.length > 0 && (
              <p className="text-xs text-gray-400 text-center">
                {displayJobs.length} of {jobs.length} applications
              </p>
            )}
          </div>
        )}

        {/* ── ANALYTICS TAB ─────────────────────────────────────────────── */}
        {tab === "analytics" && (
          <div className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100" />
                ))}
              </div>
            ) : (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Applied"
                    value={jobs.length}
                    sub="all time"
                    accent="blue"
                  />
                  <StatCard
                    label="Reply Rate"
                    value={`${replyRate}%`}
                    sub={`${replied.length} replies`}
                    accent="green"
                  />
                  <StatCard
                    label="Interview Rate"
                    value={`${interviewRate}%`}
                    sub={`${interviewed.length} interviews`}
                    accent="purple"
                  />
                  <StatCard
                    label="Avg Match Score"
                    value={avgScore ?? "—"}
                    sub={`${scoredJobs.length} scored`}
                    accent="amber"
                  />
                </div>

                {/* Platform performance table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">Platform Performance</h3>
                  <PlatformTable jobs={jobs} />
                </div>

                {/* Score distribution */}
                {scoredJobs.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">Score Distribution</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Strong  80–100", min: 80, max: 100, color: "#10b981" },
                        { label: "Good    65–79",  min: 65, max: 79,  color: "#3b82f6" },
                        { label: "Fair    50–64",  min: 50, max: 64,  color: "#f59e0b" },
                        { label: "Weak     0–49",  min: 0,  max: 49,  color: "#ef4444" },
                      ].map(({ label, min, max, color }) => {
                        const count = scoredJobs.filter(
                          (j) => (j.score ?? 0) >= min && (j.score ?? 0) <= max
                        ).length;
                        const pct = Math.round((count / scoredJobs.length) * 100);
                        return (
                          <div key={label} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 font-mono w-28 flex-shrink-0">
                              {label}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: color }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 tabular-nums w-16 text-right">
                              {count} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Adaptive engine card */}
                {stats && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Adaptive Scoring Engine</h3>
                      <span
                        className={[
                          "text-xs font-semibold px-2.5 py-1 rounded-full",
                          stats.direction === "increasing" ? "bg-amber-100 text-amber-700" :
                          stats.direction === "decreasing" ? "bg-emerald-100 text-emerald-700" :
                          "bg-gray-100 text-gray-600",
                        ].join(" ")}
                      >
                        {stats.direction === "increasing" ? "↑ Raising bar" :
                         stats.direction === "decreasing" ? "↓ Widening net" : "→ Stable"}
                      </span>
                    </div>

                    {/* Threshold triplet */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-gray-900 tabular-nums">
                          {stats.base_threshold}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Base</p>
                      </div>
                      <div>
                        <p
                          className={[
                            "text-2xl font-bold tabular-nums",
                            stats.threshold_adjustment > 0 ? "text-amber-600" :
                            stats.threshold_adjustment < 0 ? "text-emerald-600" : "text-gray-900",
                          ].join(" ")}
                        >
                          {stats.threshold_adjustment > 0
                            ? `+${stats.threshold_adjustment}`
                            : stats.threshold_adjustment}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Adjustment</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-600 tabular-nums">
                          {stats.effective_threshold}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Effective</p>
                      </div>
                    </div>

                    {/* 30-day outcome bars */}
                    <div className="space-y-2.5">
                      {[
                        { label: "Applied",    value: stats.applied_30d,     color: "#3b82f6" },
                        { label: "Replied",    value: stats.replied_30d,     color: "#10b981" },
                        { label: "Interviews", value: stats.interviewed_30d, color: "#8b5cf6" },
                      ].map(({ label, value, color }) => (
                        <ScoreBarRow
                          key={label}
                          label={label}
                          value={value}
                          max={Math.max(stats.applied_30d, 1)}
                          color={color}
                        />
                      ))}
                    </div>

                    <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
                      {stats.recommendation}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SUGGESTIONS TAB ───────────────────────────────────────────── */}
        {tab === "suggestions" && (
          <div className="space-y-6">
            <SuggestionsPanel jobs={jobs} config={config} loading={loading} />
            {!loading && (
              <SkillImpactSimulator
                jobs={jobs}
                threshold={config?.effective_threshold ?? 65}
              />
            )}
          </div>
        )}

        {/* ── INTELLIGENCE TAB ──────────────────────────────────────────── */}
        {tab === "intelligence" && (
          <div className="space-y-6">
            {intel.loading && (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-52 bg-white rounded-2xl border border-gray-100" />
                ))}
              </div>
            )}

            {intel.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                {intel.error}
                <button
                  onClick={() => intel.load()}
                  className="ml-auto text-xs font-semibold underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            )}

            {!intel.loading && !intel.data && !intel.error && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-3">
                <p className="text-3xl">🧠</p>
                <p className="font-semibold text-gray-900">Outcome Intelligence</p>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  Record outcomes on at least 10 applications to unlock pattern analysis, rejection insights, and progression tracking.
                </p>
              </div>
            )}

            {intel.data && !intel.loading && (
              <>
                {!intel.data.has_enough_data && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    <span className="font-semibold">Limited data:</span> {intel.data.with_outcomes} of {intel.data.total_analyzed} applications have outcomes recorded.
                    Insights improve significantly with 25+ tracked outcomes.
                  </div>
                )}

                <WhatWorksPanel
                  byScoreRange={intel.data.patterns.by_score_range}
                  byPlatform={intel.data.patterns.by_platform}
                  byRole={intel.data.patterns.by_role}
                  topPatterns={intel.data.patterns.top_patterns}
                  worstPatterns={intel.data.patterns.worst_patterns}
                />

                <OptimizationInsights optimization={intel.data.optimization} />

                <RejectionAnalysis
                  primaryReason={intel.data.rejection.primary_reason}
                  reasons={intel.data.rejection.reasons}
                />

                <ProgressionChart
                  weeks={intel.data.progression.weeks}
                  trendScore={intel.data.progression.trend_score}
                  trendRate={intel.data.progression.trend_rate}
                />

                <p className="text-xs text-gray-400 text-center">
                  Based on {intel.data.total_analyzed} applications · {intel.data.with_outcomes} with outcomes tracked
                </p>
              </>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ──────────────────────────────────────────────── */}
        {tab === "settings" && (
          <div className="space-y-6">
            {loading ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse h-56" />
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Application Mode</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Minimum score a job must reach before the bot applies.
                    </p>
                  </div>
                  {config && (
                    <ModeSelector
                      email={email}
                      current={config.mode}
                      onChanged={(mode: ScoringMode) =>
                        setConfig((c) => (c ? { ...c, mode } : c))
                      }
                    />
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Daily Application Limits</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Max applications per platform per day. Set to 0 to skip a platform.
                    </p>
                  </div>
                  {config && (
                    <PlatformLimits
                      email={email}
                      limits={config.platform_limits}
                      onSaved={(limits) =>
                        setConfig((c) => (c ? { ...c, platform_limits: limits } : c))
                      }
                    />
                  )}
                </div>

                {config && (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
                    <p className="font-semibold text-gray-700 mb-1">Effective threshold</p>
                    <p>
                      <span className="font-mono text-blue-600 text-lg">
                        {config.effective_threshold}
                      </span>{" "}
                      = base {config.base_threshold}
                      {config.threshold_adjustment !== 0 && (
                        <>
                          {" "}
                          {config.threshold_adjustment > 0 ? "+" : ""}
                          {config.threshold_adjustment} adaptive
                        </>
                      )}
                    </p>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Browser push notifications to keep you on track.
                    </p>
                  </div>
                  <NotificationSettings
                    appliedToday={plan.appliedToday}
                    targetToday={plan.targetToday}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Slide-in drawer */}
      <JobDetailDrawer
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onOutcome={handleOutcome}
      />

      {/* Success toast */}
      <SuccessToast outcome={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
