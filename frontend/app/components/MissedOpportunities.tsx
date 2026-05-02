"use client";

import { useState, useEffect, useCallback } from "react";
import { ScoreBadge, ScoreLabel } from "./ScoreBadge";
import { SkillPill } from "./SkillPill";
import { scoreJob, type ScoreJobOut } from "../lib/useScoringAPI";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScoredEntry = {
  id: string;
  title: string;
  company: string;
  url: string;
  scoredAt: string;
  result: ScoreJobOut;
};

// ── Storage ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "jobrocket_scored_jobs_v1";

function loadHistory(): ScoredEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: ScoredEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 25)));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreBarMini({
  label, value, max, color,
}: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-gray-400 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round((value / max) * 100)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-600 tabular-nums w-8 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

function ResultCard({
  entry, onRemove,
}: { entry: ScoredEntry; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const r = entry.result;

  return (
    <div
      className={[
        "bg-white rounded-xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md",
        r.should_apply ? "border-emerald-200" : "border-gray-100",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
          <ScoreBadge score={r.total} size="md" />
          <ScoreLabel score={r.total} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h4 className="font-semibold text-gray-900 text-sm truncate">{entry.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5">{entry.company}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={[
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  r.should_apply
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-50 text-red-500",
                ].join(" ")}
              >
                {r.should_apply ? "✓ Apply" : "✗ Skip"}
              </span>
              {entry.url && (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  View ↗
                </a>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
            {r.decision_reason}
          </p>
        </div>
      </div>

      {/* Footer: expand + remove */}
      <div className="px-4 pb-3 flex items-center justify-between border-t border-gray-50 pt-2.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
        >
          {expanded ? "Collapse" : "Full breakdown"}
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2}
          >
            <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-300">
            {new Date(entry.scoredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <button
            onClick={onRemove}
            className="text-xs text-gray-300 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Score Breakdown
            </p>
            <ScoreBarMini label="Title Match"  value={r.title_score}      max={25} color="#3b82f6" />
            <ScoreBarMini label="Skills"       value={r.skills_score}     max={35} color="#10b981" />
            <ScoreBarMini label="Experience"   value={r.experience_score} max={20} color="#f59e0b" />
            <ScoreBarMini label="Relevance"    value={r.relevance_score}  max={15} color="#8b5cf6" />
            <ScoreBarMini label="Quality"      value={r.quality_score}    max={5}  color="#6b7280" />
          </div>

          {(r.matched_skills.length > 0 || r.missing_skills.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {r.matched_skills.map((s) => <SkillPill key={s} skill={s} variant="matched" />)}
              {r.missing_skills.map((s) => <SkillPill key={s} skill={s} variant="missing" />)}
            </div>
          )}

          {r.reasoning && (
            <blockquote className="border-l-2 border-blue-200 pl-3 py-2 bg-blue-50/40 rounded-r-lg">
              <p className="text-xs text-gray-600 italic leading-relaxed">{r.reasoning}</p>
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = { email: string };

export function MissedOpportunities({ email }: Props) {
  const [title,   setTitle]   = useState("");
  const [company, setCompany] = useState("");
  const [desc,    setDesc]    = useState("");
  const [url,     setUrl]     = useState("");
  const [scoring, setScoring] = useState(false);
  const [error,   setError]   = useState("");
  const [history, setHistory] = useState<ScoredEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleScore = useCallback(async () => {
    if (!title.trim() || !desc.trim()) {
      setError("Job title and description are required.");
      return;
    }
    setScoring(true);
    setError("");
    try {
      const result = await scoreJob({
        user_email:  email,
        job_title:   title.trim(),
        company:     company.trim() || "Unknown",
        description: desc.trim(),
        job_url:     url.trim(),
      });

      const entry: ScoredEntry = {
        id:       crypto.randomUUID(),
        title:    title.trim(),
        company:  company.trim() || "Unknown",
        url:      url.trim(),
        scoredAt: new Date().toISOString(),
        result,
      };

      setHistory((prev) => {
        const updated = [entry, ...prev];
        saveHistory(updated);
        return updated;
      });

      setTitle(""); setCompany(""); setDesc(""); setUrl("");
    } catch {
      setError("Scoring failed. Make sure your profile is complete.");
    } finally {
      setScoring(false);
    }
  }, [email, title, company, desc, url]);

  function removeEntry(id: string) {
    setHistory((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      saveHistory(updated);
      return updated;
    });
  }

  return (
    <div className="space-y-5">

      {/* Input card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900">Score a Job</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Paste any job description to see your match score and whether to apply.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Job Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Company
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Job URL (optional)
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Job Description *
          </label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Paste the full job description here…"
            rows={6}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition"
          />
          <p className="text-xs text-gray-300 text-right">{desc.length} chars</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleScore}
          disabled={scoring || !title.trim() || !desc.trim()}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {scoring ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="3"
                  strokeDasharray="40" strokeDashoffset="15"
                />
              </svg>
              Scoring…
            </>
          ) : (
            "Score This Job →"
          )}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Scored Jobs</h3>
            <span className="text-xs text-gray-400">{history.length} saved locally</span>
          </div>
          {history.map((entry) => (
            <ResultCard
              key={entry.id}
              entry={entry}
              onRemove={() => removeEntry(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
