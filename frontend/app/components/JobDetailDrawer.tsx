"use client";

import { useEffect } from "react";
import { ScoreBadge, ScoreLabel } from "./ScoreBadge";
import { SkillPill } from "./SkillPill";
import { OutcomeButtons } from "./OutcomeButtons";
import { platformColor, platformIcon, platformLabel } from "../lib/platforms";
import type { ScoredJob, Outcome } from "../lib/useScoringAPI";

type ScoreBreakdown = {
  matched_skills: string[];
  missing_skills: string[];
  reasoning: string;
  title_score: number;
  skills_score: number;
  experience_score: number;
  relevance_score: number;
  quality_score: number;
};

type Props = {
  job: ScoredJob | null;
  onClose: () => void;
  onOutcome: (id: string, outcome: Outcome) => void;
};

function parseBreakdown(raw?: string): ScoreBreakdown | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function BarRow({
  label, value, max, color,
}: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-600 tabular-nums w-10 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

export function JobDetailDrawer({ job, onClose, onOutcome }: Props) {
  const isOpen = !!job;
  const breakdown = job ? parseBreakdown(job.score_breakdown) : null;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={[
          "fixed inset-0 bg-black/40 z-40 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* Drawer panel — full-width on mobile, 480px on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Job details"
        className={[
          "fixed inset-y-0 right-0 z-50 w-full md:w-[480px]",
          "bg-white shadow-2xl flex flex-col",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {job && (
          <>
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-start gap-4 px-5 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex-shrink-0">
                <ScoreBadge score={job.score ?? 0} size="lg" />
                <div className="mt-1 text-center">
                  <ScoreLabel score={job.score ?? 0} />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h2 className="font-bold text-gray-900 text-base leading-snug">{job.title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{job.company}</p>
                {job.location && (
                  <p className="text-xs text-gray-400 mt-0.5">{job.location}</p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex-shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 4L4 12M4 4l8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

              {/* Meta: platform + date + link */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[10px]"
                    style={{ background: platformColor(job.platform) }}
                  >
                    {platformIcon(job.platform)}
                  </div>
                  <span className="font-medium text-gray-700">{platformLabel(job.platform)}</span>
                </div>
                <span className="text-gray-300">·</span>
                <span>
                  Applied{" "}
                  {new Date(job.applied_at).toLocaleDateString("en-US", {
                    month: "long", day: "numeric", year: "numeric",
                  })}
                </span>
                {job.job_url && (
                  <>
                    <span className="text-gray-300">·</span>
                    <a
                      href={job.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                    >
                      View posting ↗
                    </a>
                  </>
                )}
              </div>

              {/* Score breakdown bars */}
              {breakdown ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Score Breakdown
                  </p>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <BarRow label="Title Match"  value={breakdown.title_score}      max={25} color="#3b82f6" />
                    <BarRow label="Skills"       value={breakdown.skills_score}     max={35} color="#10b981" />
                    <BarRow label="Experience"   value={breakdown.experience_score} max={20} color="#f59e0b" />
                    <BarRow label="Relevance"    value={breakdown.relevance_score}  max={15} color="#8b5cf6" />
                    <BarRow label="Quality"      value={breakdown.quality_score}    max={5}  color="#6b7280" />
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl px-5 py-6 text-center text-sm text-gray-400">
                  Score breakdown not available for this application.
                </div>
              )}

              {/* Matched skills */}
              {breakdown && breakdown.matched_skills.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Matched Skills
                    <span className="ml-2 font-bold text-emerald-600 normal-case">
                      {breakdown.matched_skills.length} matched
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {breakdown.matched_skills.map((s) => (
                      <SkillPill key={s} skill={s} variant="matched" />
                    ))}
                  </div>
                </div>
              )}

              {/* Missing skills */}
              {breakdown && breakdown.missing_skills.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Skills Gap
                    <span className="ml-2 font-bold text-red-500 normal-case">
                      {breakdown.missing_skills.length} missing
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {breakdown.missing_skills.map((s) => (
                      <SkillPill key={s} skill={s} variant="missing" />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 italic">
                    Adding these to your profile improves future match scores.
                  </p>
                </div>
              )}

              {/* AI reasoning */}
              {breakdown?.reasoning && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    AI Reasoning
                  </p>
                  <blockquote className="border-l-2 border-blue-200 pl-4 py-2.5 bg-blue-50/40 rounded-r-xl">
                    <p className="text-sm text-gray-700 leading-relaxed italic">
                      {breakdown.reasoning}
                    </p>
                  </blockquote>
                </div>
              )}
            </div>

            {/* ── Footer — outcome tracking ───────────────────────────────── */}
            <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 bg-gray-50/60 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Track Outcome
              </p>
              <OutcomeButtons
                jobId={job.id}
                current={job.outcome}
                onRecorded={(outcome) => onOutcome(job.id, outcome)}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
