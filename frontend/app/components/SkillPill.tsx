type Props = {
  skill: string;
  variant: "matched" | "missing";
};

export function SkillPill({ skill, variant }: Props) {
  return (
    <span
      className={
        variant === "matched"
          ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200"
      }
    >
      {variant === "matched" ? (
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
          <path d="M8.5 2.5L4 7 1.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      ) : (
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      )}
      {skill}
    </span>
  );
}

export function SkillPillGroup({
  matched,
  missing,
  maxEach = 4,
}: {
  matched: string[];
  missing: string[];
  maxEach?: number;
}) {
  const shownMatched = matched.slice(0, maxEach);
  const shownMissing = missing.slice(0, maxEach);
  const extraMatched = matched.length - shownMatched.length;
  const extraMissing = missing.length - shownMissing.length;

  if (matched.length === 0 && missing.length === 0) {
    return <span className="text-xs text-gray-400 italic">No skill data</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {shownMatched.map((s) => (
        <SkillPill key={s} skill={s} variant="matched" />
      ))}
      {extraMatched > 0 && (
        <span className="text-xs text-emerald-600 font-medium">+{extraMatched}</span>
      )}
      {shownMissing.map((s) => (
        <SkillPill key={s} skill={s} variant="missing" />
      ))}
      {extraMissing > 0 && (
        <span className="text-xs text-red-500 font-medium">+{extraMissing} gaps</span>
      )}
    </div>
  );
}
