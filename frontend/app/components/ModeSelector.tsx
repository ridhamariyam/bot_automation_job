"use client";

import { useState } from "react";
import { type ScoringMode, updateScoringConfig } from "../lib/useScoringAPI";

type Props = {
  email: string;
  current: ScoringMode;
  onChanged?: (mode: ScoringMode) => void;
};

const MODES: {
  value: ScoringMode;
  label: string;
  threshold: number;
  description: string;
  color: string;
  ring: string;
}[] = [
  {
    value: "aggressive",
    label: "Aggressive",
    threshold: 50,
    description: "Cast a wide net. Apply to more jobs including weaker matches.",
    color: "text-amber-700",
    ring: "ring-amber-400 bg-amber-50",
  },
  {
    value: "balanced",
    label: "Balanced",
    threshold: 65,
    description: "Default. Good-fit jobs only — quality over quantity.",
    color: "text-blue-700",
    ring: "ring-blue-400 bg-blue-50",
  },
  {
    value: "high_quality",
    label: "High Quality",
    threshold: 80,
    description: "Only strong matches. Fewer applications, higher hit rate.",
    color: "text-emerald-700",
    ring: "ring-emerald-400 bg-emerald-50",
  },
];

export function ModeSelector({ email, current, onChanged }: Props) {
  const [selected, setSelected] = useState<ScoringMode>(current);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (selected === current && !saving) {
      // nothing to do
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateScoringConfig(email, { mode: selected });
      onChanged?.(selected);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save mode.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MODES.map((m) => {
          const isSelected = selected === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setSelected(m.value)}
              className={[
                "rounded-xl p-4 text-left border-2 transition-all duration-150",
                isSelected
                  ? `border-current ring-2 ring-offset-1 ${m.ring} ${m.color}`
                  : "border-gray-200 hover:border-gray-300 bg-white",
              ].join(" ")}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{m.label}</span>
                <span
                  className={[
                    "text-xs font-bold px-1.5 py-0.5 rounded",
                    isSelected ? "bg-white/60" : "bg-gray-100 text-gray-500",
                  ].join(" ")}
                >
                  ≥{m.threshold}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{m.description}</p>
              {isSelected && (
                <div className="mt-2 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span className="text-xs font-medium">Active</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || selected === current}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {saving ? "Saving…" : "Save Mode"}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">✓ Saved</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
