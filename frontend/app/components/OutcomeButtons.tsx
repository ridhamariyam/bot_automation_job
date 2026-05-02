"use client";

import { useState } from "react";
import { type Outcome, recordOutcome } from "../lib/useScoringAPI";

type Props = {
  jobId: string;
  current?: Outcome;
  onRecorded?: (outcome: Outcome) => void;
};

const OUTCOMES: { value: Outcome; label: string; activeClass: string; inactiveClass: string }[] = [
  {
    value: "reply",
    label: "Got Reply",
    activeClass: "bg-blue-600 text-white border-blue-600",
    inactiveClass: "bg-white text-blue-600 border-blue-300 hover:bg-blue-50",
  },
  {
    value: "interview",
    label: "Interview",
    activeClass: "bg-emerald-600 text-white border-emerald-600",
    inactiveClass: "bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50",
  },
  {
    value: "rejected",
    label: "Rejected",
    activeClass: "bg-gray-500 text-white border-gray-500",
    inactiveClass: "bg-white text-gray-500 border-gray-300 hover:bg-gray-50",
  },
];

export function OutcomeButtons({ jobId, current, onRecorded }: Props) {
  const [active, setActive] = useState<Outcome | undefined>(current);
  const [loading, setLoading] = useState<Outcome | null>(null);
  const [error, setError] = useState("");

  async function handleClick(outcome: Outcome) {
    if (loading) return;
    // Clicking the active outcome again clears it (UI-only — no API to clear)
    if (active === outcome) return;
    setLoading(outcome);
    setError("");
    try {
      await recordOutcome(jobId, outcome);
      setActive(outcome);
      onRecorded?.(outcome);
    } catch {
      setError("Failed to save");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5 flex-wrap">
        {OUTCOMES.map(({ value, label, activeClass, inactiveClass }) => (
          <button
            key={value}
            onClick={() => handleClick(value)}
            disabled={!!loading}
            className={[
              "px-2.5 py-1 rounded-md text-xs font-semibold border transition-all duration-150",
              active === value ? activeClass : inactiveClass,
              loading === value ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            {loading === value ? "…" : label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
