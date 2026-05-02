import { useMemo } from "react";
import type { ScoredJob } from "../lib/useScoringAPI";

// ── Levels ─────────────────────────────────────────────────────────────────────

const LEVELS = [
  { name: "Newcomer",    emoji: "🌱", xpRequired: 0    },
  { name: "Applicant",   emoji: "📝", xpRequired: 100  },
  { name: "Seeker",      emoji: "🔍", xpRequired: 300  },
  { name: "Contender",   emoji: "⚡", xpRequired: 600  },
  { name: "Networker",   emoji: "🤝", xpRequired: 1000 },
  { name: "Specialist",  emoji: "🎯", xpRequired: 1500 },
  { name: "Expert",      emoji: "🏆", xpRequired: 2200 },
  { name: "Legend",      emoji: "👑", xpRequired: 3000 },
] as const;

const OUTCOME_XP: Record<string, number> = {
  reply:     50,
  interview: 150,
  offer:     300,
};

// ── Hook ───────────────────────────────────────────────────────────────────────

export type XPResult = {
  totalXP: number;
  level: number;
  levelName: string;
  levelEmoji: string;
  currentLevelXP: number;
  nextLevelXP: number;
  progressPct: number;
  isMaxLevel: boolean;
  applyXP: number;
  outcomeXP: number;
  streakXP: number;
};

export function useXP(jobs: ScoredJob[], streakDays: number): XPResult {
  return useMemo(() => {
    const applyXP   = jobs.length * 10;
    const outcomeXP = jobs.reduce((sum, j) => sum + (j.outcome ? (OUTCOME_XP[j.outcome] ?? 0) : 0), 0);
    const streakXP  = streakDays * 5;
    const totalXP   = applyXP + outcomeXP + streakXP;

    let level = 0;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (totalXP >= LEVELS[i].xpRequired) { level = i; break; }
    }

    const isMaxLevel     = level === LEVELS.length - 1;
    const currentFloor   = LEVELS[level].xpRequired;
    const nextFloor      = isMaxLevel ? currentFloor + 1000 : LEVELS[level + 1].xpRequired;
    const currentLevelXP = totalXP - currentFloor;
    const nextLevelXP    = nextFloor - currentFloor;
    const progressPct    = Math.min(100, Math.round((currentLevelXP / nextLevelXP) * 100));

    return {
      totalXP,
      level,
      levelName:    LEVELS[level].name,
      levelEmoji:   LEVELS[level].emoji,
      currentLevelXP,
      nextLevelXP,
      progressPct,
      isMaxLevel,
      applyXP,
      outcomeXP,
      streakXP,
    };
  }, [jobs, streakDays]);
}
