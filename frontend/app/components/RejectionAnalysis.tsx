"use client";

import type { RejectionReason } from "../lib/useScoringAPI";

const SEVERITY_CONFIG = {
  high:   { dot: "bg-red-500",    badge: "bg-red-100 text-red-700",    bar: "#ef4444", label: "High" },
  medium: { dot: "bg-amber-500",  badge: "bg-amber-100 text-amber-700", bar: "#f59e0b", label: "Medium" },
  low:    { dot: "bg-gray-300",   badge: "bg-gray-100 text-gray-500",   bar: "#d1d5db", label: "Low" },
};

const TYPE_ICON: Record<string, string> = {
  skill_gap:   "🔧",
  targeting:   "🎯",
  experience:  "📅",
  profile:     "📄",
};

function ReasonCard({ reason, rank }: { reason: RejectionReason; rank: number }) {
  const cfg = SEVERITY_CONFIG[reason.severity];
  const icon = TYPE_ICON[reason.type] ?? "⚠️";
  const isPrimary = rank === 0;

  return (
    <div
      className={[
        "rounded-xl border p-4 space-y-3 transition-shadow",
        isPrimary ? "border-red-200 bg-red-50/40 shadow-sm" : "border-gray-100 bg-white",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{icon}</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900">{reason.label}</p>
              {isPrimary && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                  Primary
                </span>
              )}
            </div>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Severity bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: reason.severity === "high" ? "85%" : reason.severity === "medium" ? "55%" : "25%",
              background: cfg.bar,
            }}
          />
        </div>
      </div>

      {/* Evidence */}
      <p className="text-xs text-gray-600 leading-relaxed">{reason.evidence}</p>

      {/* Skill gap pills */}
      {reason.top_gaps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reason.top_gaps.map((s) => (
            <span
              key={s}
              className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  primaryReason: string;
  reasons: RejectionReason[];
};

export function RejectionAnalysis({ primaryReason, reasons }: Props) {
  if (reasons.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Rejection Analysis</h3>
        <div className="text-center py-8 space-y-2">
          <p className="text-2xl">🔍</p>
          <p className="text-sm text-gray-500">
            Record outcomes on more applications to infer rejection patterns.
          </p>
        </div>
      </div>
    );
  }

  const primaryLabel = primaryReason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900">Rejection Analysis</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Inferred from score breakdowns and outcome patterns.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <span className="text-xs text-gray-500">Primary:</span>
          <span className="text-xs font-bold text-red-700">{primaryLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {reasons.map((r, i) => (
          <ReasonCard key={r.type} reason={r} rank={i} />
        ))}
      </div>
    </div>
  );
}
