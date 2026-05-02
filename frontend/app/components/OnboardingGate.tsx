"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";

type ProfileStatus = "loading" | "complete" | "incomplete" | "error";

type ProfileCheck = {
  has_target_titles: boolean;
  has_skills: boolean;
  has_verified_platform: boolean;
  missing: string[];
};

async function checkProfile(email: string): Promise<ProfileCheck> {
  const data = await apiFetch<{
    target_titles?: string;
    skills?: string;
  }>(`/api/profile/${encodeURIComponent(email)}`);

  const hasTitles = Boolean(data.target_titles?.trim());
  const hasSkills = Boolean(data.skills?.trim());
  const missing: string[] = [];
  if (!hasTitles) missing.push("target job titles");
  if (!hasSkills) missing.push("skills");

  return {
    has_target_titles: hasTitles,
    has_skills: hasSkills,
    has_verified_platform: true, // checked separately in bot settings
    missing,
  };
}

type Props = { email: string };

export function OnboardingGate({ email }: Props) {
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [missing, setMissing] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!email) return;
    const key = `jobrocket_onboarding_dismissed_${email}`;
    if (sessionStorage.getItem(key)) { setDismissed(true); return; }

    checkProfile(email)
      .then((check) => {
        setMissing(check.missing);
        setStatus(check.missing.length > 0 ? "incomplete" : "complete");
      })
      .catch(() => setStatus("error"));
  }, [email]);

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem(`jobrocket_onboarding_dismissed_${email}`, "1");
  }

  if (dismissed || status === "loading" || status === "complete" || status === "error") {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
      <span className="text-lg leading-none mt-0.5 flex-shrink-0">🚀</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">Complete your profile to get started</p>
        <p className="text-sm text-amber-700 mt-0.5">
          Missing: <span className="font-medium">{missing.join(", ")}</span>.
          The bot needs your profile to find and apply to matching jobs.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href="/dashboard"
          className="text-xs font-semibold px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
        >
          Set up profile →
        </Link>
        <button
          onClick={dismiss}
          className="text-amber-500 hover:text-amber-700 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
