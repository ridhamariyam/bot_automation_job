"use client";

import { platformLabel } from "../lib/platforms";
import type { OutcomeIntelligence } from "../lib/useScoringAPI";

type Opt = OutcomeIntelligence["optimization"];

function InsightCard({
  icon, label, value, rationale, accent,
}: {
  icon: string;
  label: string;
  value: string | number;
  rationale: string;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${accent}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{icon}</span>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
      <p className="text-xs text-gray-500 leading-relaxed">{rationale}</p>
    </div>
  );
}

type Props = { optimization: Opt };

export function OptimizationInsights({ optimization: o }: Props) {
  const platformDisplay = o.best_platform
    ? platformLabel(o.best_platform)
    : "—";
  const roleDisplay = o.best_role
    ? o.best_role.replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900">Optimization Insights</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Data-driven recommendations to improve your reply rate.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InsightCard
          icon="🎯"
          label="Ideal Score Threshold"
          value={`≥ ${o.ideal_threshold}`}
          rationale={o.threshold_rationale}
          accent="bg-blue-50/60 border-blue-100"
        />
        <InsightCard
          icon="🏆"
          label="Best Platform"
          value={platformDisplay}
          rationale={o.platform_rationale}
          accent="bg-emerald-50/60 border-emerald-100"
        />
        <InsightCard
          icon="💼"
          label="Best Role Focus"
          value={roleDisplay}
          rationale={o.role_rationale}
          accent="bg-purple-50/60 border-purple-100"
        />
      </div>
    </div>
  );
}
