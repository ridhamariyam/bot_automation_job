"use client";

import { useState } from "react";
import { updateScoringConfig } from "../lib/useScoringAPI";

const PLATFORMS = [
  { key: "linkedin",    label: "LinkedIn",    color: "bg-[#0077B5]" },
  { key: "indeed",      label: "Indeed",      color: "bg-[#003A9B]" },
  { key: "glassdoor",   label: "Glassdoor",   color: "bg-[#0CAA41]" },
  { key: "monster",     label: "Monster",     color: "bg-[#6B0FAC]" },
  { key: "google_jobs", label: "Google Jobs", color: "bg-[#EA4335]" },
  { key: "naukri",      label: "Naukri",      color: "bg-[#FF7555]" },
  { key: "bayt",        label: "Bayt",        color: "bg-[#005BAC]" },
  { key: "timesjobs",   label: "TimesJobs",   color: "bg-[#E83030]" },
];

type Props = {
  email: string;
  limits: Record<string, number>;
  onSaved?: (limits: Record<string, number>) => void;
};

export function PlatformLimits({ email, limits, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, number>>(limits);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function handleChange(key: string, raw: string) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0 && n <= 200) {
      setValues((prev) => ({ ...prev, [`${key}_daily`]: n }));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload: Record<string, number> = {};
      for (const { key } of PLATFORMS) {
        const v = values[`${key}_daily`] ?? values[key];
        if (v !== undefined) payload[`${key}_daily`] = v;
      }
      await updateScoringConfig(email, payload);
      onSaved?.(values);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save limits.");
    } finally {
      setSaving(false);
    }
  }

  function getVal(key: string): number {
    return values[`${key}_daily`] ?? values[key] ?? 0;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {PLATFORMS.map(({ key, label, color }) => (
          <div key={key} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-md ${color} flex items-center justify-center`}>
                <span className="text-white text-xs font-bold">{label[0]}</span>
              </div>
              <span className="text-xs font-semibold text-gray-700">{label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={200}
                value={getVal(key)}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-full text-sm font-semibold border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">/day</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition"
        >
          {saving ? "Saving…" : "Save Limits"}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">✓ Saved</span>}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
