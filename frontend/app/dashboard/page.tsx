"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, logout } from "../lib/useAuth";

type UserProfile = { name: string; email: string };

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  platform: string;
  job_url?: string;
  status: string;
  applied_at: string;
  proof?: string;
  has_cover_letter?: boolean;
  has_tailored_resume?: boolean;
};

const API = process.env.NEXT_PUBLIC_API_URL as string;

function parseExpiredPlatform(message: string) {
  const match = message.match(/SESSION_EXPIRED:([a-z_]+)/i);
  return match?.[1]?.toLowerCase() ?? "";
}

async function apiFetch(path: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_STYLES: Record<string, string> = {
  Applied:   "bg-[#EAF1FB] text-[#2F6DB5]",
  Viewed:    "bg-[#FEF6E4] text-[#9A6600]",
  Interview: "bg-[#E8F8EE] text-[#2A7A4B]",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_STYLES[status] ?? "bg-[#F3EEE8] text-[#7A6A5E]"}`}>
      {status}
    </span>
  );
}

// ── Stat card (floats up over the hero gradient) ──
function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.10),0_1px_4px_rgba(0,0,0,0.06)] flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <p className="text-[11px] font-semibold text-[#A89F97] uppercase tracking-wide leading-none">
          {label}
        </p>
      </div>
      <p className="text-[28px] font-bold text-[#1A1714] leading-none tabular-nums">{value}</p>
    </div>
  );
}

// ── Rocket logo mark ──
function RocketMark({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-[10px] flex items-center justify-center shrink-0 bg-white/15"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 1.5C9 1.5 14 4.5 14 9.75L9 15L4 9.75C4 4.5 9 1.5 9 1.5Z" fill="white" />
        <circle cx="9" cy="8.5" r="2" fill="rgba(255,255,255,0.25)" />
        <path d="M4 9.75L1.5 15L5 13Z" fill="rgba(255,255,255,0.4)" />
        <path d="M14 9.75L16.5 15L13 13Z" fill="rgba(255,255,255,0.4)" />
      </svg>
    </div>
  );
}

export default function DashboardPage() {
  useAuth();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [botRunning, setBotRunning] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState("");
  const [credentialsMissing, setCredentialsMissing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [botLogs, setBotLogs] = useState<
    Array<{ timestamp: string; level: string; message: string }>
  >([]);
  const [stats, setStats] = useState({
    total: 0,
    by_status: {} as Record<string, number>,
  });

  const refreshData = (email: string) => {
    apiFetch(`/api/jobs/${encodeURIComponent(email)}`)
      .then((data: Job[]) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]));
    apiFetch(`/api/jobs/stats/${encodeURIComponent(email)}`)
      .then((s) => setStats(s))
      .catch(() => {});
    apiFetch(`/api/bot/logs/${encodeURIComponent(email)}?limit=20`)
      .then((logs) => setBotLogs(Array.isArray(logs) ? logs : []))
      .catch(() => {});
  };

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    if (!stored) { router.push("/login"); return; }
    const u = JSON.parse(stored);
    setUser(u);

    fetch(`${API}/api/profile/${encodeURIComponent(u.email)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        const connected = Boolean(
          p?.linkedin_verified ||
          p?.indeed_verified
        );
        setCredentialsMissing(!connected);
        refreshData(u.email);
      })
      .catch(() => { refreshData(u.email); });

    apiFetch(`/api/bot/status?email=${encodeURIComponent(u.email)}`)
      .then((s: { running: boolean }) => setBotRunning(s.running))
      .catch(() => {});

    const interval = setInterval(() => {
      refreshData(u.email);
      apiFetch(`/api/bot/status?email=${encodeURIComponent(u.email)}`)
        .then((s: { running: boolean }) => setBotRunning(s.running))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [router]);

  const toggleBot = async () => {
    if (!user) return;
    setBotLoading(true);
    setBotError("");
    try {
      if (botRunning) {
        await apiFetch(`/api/bot/stop?email=${encodeURIComponent(user.email)}`);
        setBotRunning(false);
      } else {
        const token = localStorage.getItem("token") ?? "";
        const res = await fetch(`${API}/api/bot/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: user.email, token, max_jobs: 50 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Could not start bot");
        setBotRunning(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error";
      const expiredPlatform = parseExpiredPlatform(message);

      if (expiredPlatform) {
        setCredentialsMissing(true);
        router.push(`/settings?tab=platforms&expired=${encodeURIComponent(expiredPlatform)}`);
        return;
      }

      setBotError(message);
    } finally {
      setBotLoading(false);
    }
  };

  const appliedToday = Object.entries(stats.by_status).reduce(
    (sum, [status, count]) => (status === "Applied" ? sum + count : sum),
    0
  );

  return (
    <div className="min-h-screen bg-[#F5F0EA]">

      {/* ══ GRADIENT HERO HEADER ══ */}
      <div
        className="relative overflow-hidden pb-24"
        style={{ background: "linear-gradient(160deg, #1C1410 0%, #2A1C12 50%, #3E2416 100%)" }}
      >
        {/* Dot grid texture */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-[0.04] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, #C8A882 0%, transparent 70%)" }} />

        {/* Nav */}
        <nav className="relative max-w-2xl mx-auto px-4 pt-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <RocketMark size={34} />
            <span className="font-bold text-white tracking-tight text-[16px]">JobRocket</span>
          </div>

          <div className="flex items-center gap-0.5">
            <Link
              href="/scoring"
              className="px-3 py-1.5 text-[13px] text-white/55 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              Scoring
            </Link>
            <Link
              href="/resume"
              className="hidden sm:block px-3 py-1.5 text-[13px] text-white/55 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              Resume
            </Link>
            <Link
              href="/settings"
              className="px-3 py-1.5 text-[13px] text-white/55 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              Settings
            </Link>
            <button
              onClick={() => logout(router)}
              className="px-3 py-1.5 text-[13px] text-white/55 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              Sign out
            </button>
          </div>
        </nav>

        {/* Greeting */}
        <div className="relative max-w-2xl mx-auto px-4 mt-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-bold text-white tracking-tight leading-snug">
                {user ? `Hey, ${user.name.split(" ")[0]}` : "Dashboard"}
              </h1>
              <p className="text-white/50 text-[14px] mt-1">
                {botRunning
                  ? "Your bot is running — applications are being submitted."
                  : credentialsMissing
                  ? "Connect LinkedIn or Indeed via browser to start applying automatically."
                  : "Ready to launch — start the bot when you're set."}
              </p>
            </div>

            {/* Live badge */}
            {botRunning && (
              <div className="shrink-0 flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-3.5 py-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 text-[13px] font-semibold">Live</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ MAIN CONTENT (pulls up over gradient) ══ */}
      <main className="max-w-2xl mx-auto px-4 -mt-16 relative z-10 pb-10 space-y-4">

        {/* ── Stats (floating cards) ── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Applied"  value={stats.total}                    accent="#4A90D9" />
          <StatCard label="Today"    value={appliedToday}                   accent="#3DC97A" />
          <StatCard label="Viewed"   value={stats.by_status["Viewed"] || 0} accent="#F5A623" />
        </div>

        {/* ── Connect platform banner ── */}
        {credentialsMissing && (
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] flex items-start gap-4">
            {/* Icon */}
            <div className="w-11 h-11 rounded-xl bg-[#F0E9DF] flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A89F97" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-[#1A1714] leading-snug">
                Connect a platform to start applying
              </p>
              <p className="text-[13px] text-[#A89F97] mt-1 leading-relaxed">
                Connect LinkedIn or Indeed via browser and the bot will apply to matching jobs automatically.
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 mt-3 w-full sm:w-auto justify-center sm:justify-start
                  px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white
                  active:scale-95 transition-all duration-150"
                style={{ background: "linear-gradient(135deg, #1C1410 0%, #3E2416 100%)", boxShadow: "0 2px 12px rgba(28,20,16,0.22)" }}
              >
                Connect a platform
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 6h8M7 3l3 3-3 3" />
                </svg>
              </Link>
            </div>
          </div>
        )}

        {/* ── Bot control card ── */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
          {/* Card header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#1A1714]">Automation</h2>
              <p className="text-[12px] text-[#A89F97] mt-0.5">
                {botRunning ? "Scanning & applying to matching jobs" : "Start to begin applying automatically"}
              </p>
            </div>
            <div className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border",
              botRunning
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-[#F5F0EA] border-[#E8E0D4] text-[#A89F97]",
            ].join(" ")}>
              <span className={`w-1.5 h-1.5 rounded-full ${botRunning ? "bg-emerald-500 animate-pulse" : "bg-[#C8C0B8]"}`} />
              {botRunning ? "Running" : "Idle"}
            </div>
          </div>

          {botError && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 text-[13px] rounded-xl px-4 py-3 mb-4 leading-snug">
              {botError}
            </div>
          )}

          {/* Big CTA button */}
          <button
            onClick={toggleBot}
            disabled={botLoading || (credentialsMissing && !botRunning)}
            className="w-full py-4 rounded-2xl text-[14px] font-bold text-white
              transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
            style={{
              background: botRunning
                ? "linear-gradient(135deg, #E53E3E 0%, #C53030 100%)"
                : "linear-gradient(135deg, #1C1410 0%, #3E2416 100%)",
              boxShadow: botRunning
                ? "0 4px 20px rgba(197,48,48,0.30), 0 1px 4px rgba(0,0,0,0.1)"
                : "0 4px 20px rgba(28,20,16,0.28), 0 1px 4px rgba(0,0,0,0.1)",
            }}
          >
            {botLoading
              ? "Please wait…"
              : botRunning
              ? "Stop Bot"
              : "Start Applying"}
          </button>

          {credentialsMissing && !botRunning && (
            <p className="text-[12px] text-[#B5AFA9] text-center mt-3 leading-snug">
              Connect a platform first —{" "}
              <Link href="/settings" className="underline underline-offset-2 hover:text-[#1A1714] transition">
                go to Settings
              </Link>
            </p>
          )}
        </div>

        {/* ── Scoring analytics card ── */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#1A1714]">Job Scoring</h2>
              <p className="text-[12px] text-[#A89F97] mt-0.5">
                Analyze & optimize your applications
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F6DB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 17"></polyline>
                <polyline points="17 6 23 6 23 12"></polyline>
              </svg>
            </div>
          </div>

          <p className="text-[13px] text-[#5C5550] leading-relaxed mb-4">
            View detailed scoring analytics, track your strongest opportunities, and get AI-powered recommendations to improve match rates.
          </p>

          <Link
            href="/scoring"
            className="w-full py-3.5 rounded-2xl text-[14px] font-bold text-white text-center
              transition-all duration-200 active:scale-[0.98] hover:shadow-lg"
            style={{
              background: "linear-gradient(135deg, #2F6DB5 0%, #1C4A8F 100%)",
              boxShadow: "0 4px 15px rgba(47,109,181,0.25), 0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            View Scoring Dashboard
            <span className="inline-block ml-1.5 text-[12px]">→</span>
          </Link>
        </div>

        {/* ── Live activity feed ── */}
        {botRunning && botLogs.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-[15px] font-semibold text-[#1A1714]">Live activity</h2>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {botLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={[
                    "flex gap-3 px-3 py-2.5 rounded-xl text-[13px]",
                    log.level === "error"   ? "bg-rose-50 text-rose-700"
                    : log.level === "success" ? "bg-emerald-50 text-emerald-700"
                    : log.level === "warn"    ? "bg-amber-50 text-amber-700"
                    :                           "bg-[#F8F4EF] text-[#5C5550]",
                  ].join(" ")}
                >
                  <span className="shrink-0 font-mono text-[12px] mt-px opacity-60">
                    {log.level === "error" ? "✗" : log.level === "success" ? "✓" : log.level === "warn" ? "!" : "·"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="whitespace-pre-wrap break-words leading-snug">{log.message}</p>
                    <p className="text-[10px] opacity-50 mt-0.5">{new Date(log.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Applications ── */}
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-[#1A1714]">Applications</h2>
            {jobs.length > 0 && (
              <span className="text-[12px] text-[#A89F97] font-medium">{jobs.length} total</span>
            )}
          </div>

          {jobs.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center gap-3">
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
                <rect width="52" height="52" rx="15" fill="#F0E9DF" />
                <rect x="14" y="16" width="24" height="3.5" rx="1.75" fill="#D9CEBC" />
                <rect x="14" y="23" width="17" height="3.5" rx="1.75" fill="#E3D9CC" />
                <rect x="14" y="30" width="20" height="3.5" rx="1.75" fill="#DDD4C4" />
              </svg>
              <div>
                <p className="text-[14px] font-semibold text-[#1A1714]">No applications yet</p>
                <p className="text-[13px] text-[#A89F97] mt-1 leading-relaxed max-w-[240px]">
                  {credentialsMissing
                    ? "Connect a platform first, then start the bot."
                    : "Hit Start Applying to begin submitting applications."}
                </p>
              </div>
              {credentialsMissing && (
                <Link
                  href="/settings"
                  className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-full
                    text-[13px] font-semibold text-[#1A1714]
                    border border-[#DDD7CF] hover:bg-[#F5EFE8] hover:border-[#C8BFB4]
                    active:scale-95 transition-all duration-150"
                >
                  Go to Settings
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Mobile: stacked cards */}
              <div className="md:hidden space-y-2">
                {jobs.slice(0, 20).map((job) => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className="w-full text-left bg-[#FAF6F1] hover:bg-[#F5EFE8] rounded-xl px-4 py-3.5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#1A1714] leading-snug truncate">
                          {job.title}
                        </p>
                        <p className="text-[12px] text-[#A89F97] mt-0.5 truncate">
                          {job.company} · {job.location}
                        </p>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="text-[11px] text-[#C0B8AF] mt-2">
                      {new Date(job.applied_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </button>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#EDE8E0]">
                      {["Role", "Company", "Status", "Date", ""].map((h) => (
                        <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold text-[#A89F97] uppercase tracking-wider first:pl-0 last:pr-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3EEE8]">
                    {jobs.slice(0, 20).map((job) => (
                      <tr key={job.id} className="hover:bg-[#FAF6F1] transition group">
                        <td className="py-3 px-3 pl-0">
                          <p className="font-medium text-[#1A1714] leading-snug">{job.title}</p>
                          <p className="text-[11px] text-[#A89F97] mt-0.5">{job.location}</p>
                        </td>
                        <td className="py-3 px-3 text-[#5C5550]">{job.company}</td>
                        <td className="py-3 px-3"><StatusBadge status={job.status} /></td>
                        <td className="py-3 px-3 text-[#A89F97]">
                          {new Date(job.applied_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </td>
                        <td className="py-3 px-3 pr-0">
                          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => setSelectedJob(job)}
                              className="text-[12px] font-medium text-[#7C736C] hover:text-[#1A1714] transition"
                            >
                              Details
                            </button>
                            {job.has_tailored_resume && (
                              <a
                                href={`${API}/api/jobs/${job.id}/tailored-resume/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[12px] font-medium text-[#7C736C] hover:text-[#1A1714] transition"
                              >
                                CV
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {jobs.length > 20 && (
                <p className="text-center text-[12px] text-[#A89F97] pt-4">
                  Showing 20 of {jobs.length}
                </p>
              )}
            </>
          )}
        </div>

        {/* ── How it works ── */}
        <div className="bg-white rounded-2xl px-5 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[11px] font-bold text-[#C0B8AF] uppercase tracking-widest mb-3.5">
            How it works
          </p>
          <div className="space-y-3">
            {[
              { n: "1", t: "Connect a platform", d: "Link LinkedIn or Indeed in Settings." },
              { n: "2", t: "Start the bot",       d: "Hit Start — it scans jobs that match your profile." },
              { n: "3", t: "Track results",        d: "Applications appear above. Check back regularly." },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[#F0E9DF] text-[11px] font-bold text-[#A89F97] flex items-center justify-center shrink-0 mt-px">
                  {s.n}
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-[#1A1714] leading-snug">{s.t}</p>
                  <p className="text-[12px] text-[#A89F97] mt-0.5 leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-[#C0B8AF] mt-4 pt-3.5 border-t border-[#F0E9E1]">
            Need help? ridhamariyam44@gmail.com · +974 7085 8175
          </p>
        </div>
      </main>

      {/* ══ JOB DETAIL MODAL ══ */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
          style={{ background: "rgba(28,20,12,0.50)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedJob(null); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md shadow-[0_20px_60px_rgba(0,0,0,0.20)] overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-[#F0EAE2] shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-bold text-[#1A1714] leading-snug">{selectedJob.title}</h2>
                <p className="text-[13px] text-[#9C9490] mt-0.5">{selectedJob.company} · {selectedJob.location}</p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5EFE8] text-[#A89F97] hover:text-[#1A1714] transition shrink-0 mt-0.5"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M1 1l10 10M11 1L1 11" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Platform",     value: selectedJob.platform },
                  { label: "Date applied", value: new Date(selectedJob.applied_at).toLocaleDateString() },
                  {
                    label: "Method",
                    value: selectedJob.proof?.includes("email") || selectedJob.proof?.includes("gmail")
                      ? "Email submission" : "Easy Apply",
                  },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-[11px] font-bold text-[#B8B0A8] uppercase tracking-wider mb-1">{f.label}</p>
                    <p className="text-[14px] font-medium text-[#1A1714]">{f.value}</p>
                  </div>
                ))}
                <div>
                  <p className="text-[11px] font-bold text-[#B8B0A8] uppercase tracking-wider mb-1">Status</p>
                  <StatusBadge status={selectedJob.status} />
                </div>
              </div>

              {selectedJob.proof && (
                <div className="bg-[#FAF6F1] rounded-xl p-4">
                  <p className="text-[11px] font-bold text-[#B8B0A8] uppercase tracking-wider mb-2">Proof</p>
                  <p className="text-[13px] text-[#5C5550] whitespace-pre-wrap break-words leading-relaxed">
                    {selectedJob.proof}
                  </p>
                </div>
              )}

              {selectedJob.job_url && (
                <a
                  href={selectedJob.job_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[14px] font-semibold text-[#1A1714]
                    border border-[#DDD7CF] hover:bg-[#F5EFE8] hover:border-[#C8BFB4]
                    active:scale-[0.98] transition-all duration-150"
                >
                  View job listing
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 11L11 2M11 2H5M11 2v6" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
