"use client";

import { useEffect, useRef } from "react";
import type { Outcome } from "../lib/useScoringAPI";

// ── Config ─────────────────────────────────────────────────────────────────────

const CONFIG: Record<string, { emoji: string; title: string; sub: string; xp: number; gradient: string }> = {
  reply: {
    emoji:    "💌",
    title:    "They replied!",
    sub:      "Keep the momentum going — follow up within 24 hours.",
    xp:       50,
    gradient: "from-blue-600 to-indigo-600",
  },
  interview: {
    emoji:    "🎉",
    title:    "Interview booked!",
    sub:      "Prep your STAR stories and company research.",
    xp:       150,
    gradient: "from-emerald-500 to-teal-600",
  },
  offer: {
    emoji:    "🏆",
    title:    "You got an offer!",
    sub:      "Incredible — take time to evaluate before deciding.",
    xp:       300,
    gradient: "from-amber-400 to-orange-500",
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  outcome: Outcome | null;
  onDismiss: () => void;
};

export function SuccessToast({ outcome, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!outcome) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDismiss, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [outcome, onDismiss]);

  const cfg = outcome ? CONFIG[outcome] : null;
  const visible = cfg != null;

  return (
    <div
      className={[
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none",
        "transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
      ].join(" ")}
      aria-live="polite"
    >
      {cfg && (
        <div
          className={`bg-gradient-to-r ${cfg.gradient} text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 pointer-events-auto min-w-72 max-w-sm`}
        >
          <span className="text-3xl leading-none flex-shrink-0">{cfg.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-snug">{cfg.title}</p>
            <p className="text-xs text-white/80 mt-0.5 leading-relaxed">{cfg.sub}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs font-bold text-white/90">+{cfg.xp} XP</p>
            <button
              onClick={onDismiss}
              className="text-white/60 hover:text-white text-xs mt-1 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
