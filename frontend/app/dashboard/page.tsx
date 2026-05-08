"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "../lib/useAuth";
import { apiFetch, API } from "../lib/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Badge, StatusDot } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonRow } from "../components/ui/Skeleton";
import { Bot, Briefcase, TrendingUp, AlertCircle, ExternalLink, Play, Square } from "lucide-react";

type Job = {
  id: string; title: string; company: string; location: string;
  platform: string; status: string; applied_at: string; job_url?: string;
  score?: number;
};
type Stats = { total: number; by_status: Record<string, number>; by_platform: Record<string, number> };

function parseExpiredPlatform(msg: string) {
  return msg.match(/SESSION_EXPIRED:([a-z_]+)/i)?.[1]?.toLowerCase() ?? "";
}

function StatCard({ label, value, icon: Icon, trend }: { label: string; value: number; icon: React.ElementType; trend?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
          <Icon size={15} className="text-slate-400" />
        </div>
      </div>
      <p className="text-[28px] font-bold text-slate-900 tabular-nums leading-none">{value}</p>
      {trend && <p className="text-[12px] text-slate-400 mt-1.5">{trend}</p>}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-slate-200";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] text-slate-400 tabular-nums">{score}</span>
    </div>
  );
}

export default function DashboardPage() {
  useAuth();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, by_status: {}, by_platform: {} });
  const [botRunning, setBotRunning] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState("");
  const [credentialsMissing, setCredentialsMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const refreshData = (email: string) => {
    apiFetch<Job[]>(`/api/jobs/${encodeURIComponent(email)}`)
      .then(d => setJobs(Array.isArray(d) ? d : []))
      .catch(() => setJobs([]));
    apiFetch<Stats>(`/api/jobs/stats/${encodeURIComponent(email)}`)
      .then(s => setStats(s))
      .catch(() => {});
  };

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    if (!stored) { router.push("/login"); return; }
    const u = JSON.parse(stored);
    setUser(u);

    Promise.all([
      fetch(`${API}/api/profile/${encodeURIComponent(u.email)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }).then(r => r.ok ? r.json() : null),
      apiFetch<{ running: boolean }>(`/api/bot/status?email=${encodeURIComponent(u.email)}`),
    ]).then(([profile, botStatus]) => {
      setCredentialsMissing(!profile?.linkedin_verified && !profile?.indeed_verified);
      setBotRunning(botStatus?.running ?? false);
      refreshData(u.email);
    }).catch(() => refreshData(u.email))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      refreshData(u.email);
      apiFetch<{ running: boolean }>(`/api/bot/status?email=${encodeURIComponent(u.email)}`)
        .then(s => setBotRunning(s.running)).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [router]);

  async function toggleBot() {
    if (!user) return;
    setBotLoading(true);
    setBotError("");
    try {
      if (botRunning) {
        const res = await fetch(`${API}/api/bot/stop?email=${encodeURIComponent(user.email)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail ?? "Could not stop bot"); }
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
      const msg = err instanceof Error ? err.message : "Error";
      const expiredPlatform = parseExpiredPlatform(msg);
      if (expiredPlatform) {
        setCredentialsMissing(true);
        router.push(`/settings?tab=platforms&expired=${encodeURIComponent(expiredPlatform)}`);
        return;
      }
      setBotError(msg);
    } finally {
      setBotLoading(false);
    }
  }

  const recentJobs = jobs.slice(0, 8);
  const interviewCount = stats.by_status["Interview"] ?? 0;

  return (
    <DashboardLayout
      title="Overview"
      actions={
        user ? (
          <span className="text-[12px] text-slate-400 hidden sm:block">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </span>
        ) : undefined
      }
    >
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6"
      >
        <h2 className="text-[20px] font-semibold text-slate-900">
          {user ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}` : "Overview"}
        </h2>
        <p className="text-[13.5px] text-slate-500 mt-0.5">
          {botRunning
            ? "Automation is running — applications are being submitted."
            : credentialsMissing
            ? "Connect a platform in Settings to begin automation."
            : "Ready to run. Start the bot when you're set."}
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Applied" value={stats.total} icon={Briefcase} />
        <StatCard label="Interviews" value={interviewCount} icon={TrendingUp} />
        <StatCard label="This Week" value={stats.by_status["Applied"] ?? 0} icon={Bot} trend="applications" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left — Applications table */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recent applications */}
          <div className="bg-white rounded-xl border border-slate-100">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-50">
              <h3 className="heading-4 text-slate-900">Recent applications</h3>
              {jobs.length > 0 && (
                <Link href="/applications" className="text-[12px] text-indigo-600 hover:text-indigo-700 font-medium transition">
                  View all {jobs.length} →
                </Link>
              )}
            </div>

            {loading ? (
              <div className="px-5 py-2">
                {[1, 2, 3, 4].map(i => <SkeletonRow key={i} />)}
              </div>
            ) : recentJobs.length === 0 ? (
              <EmptyState
                icon={<Briefcase size={20} />}
                title="No applications yet"
                description={credentialsMissing ? "Connect a platform first, then start the bot." : "Start the bot to begin submitting applications."}
                action={
                  credentialsMissing ? (
                    <Link href="/settings" className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                      Connect platform
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-slate-50">
                {recentJobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-slate-900 truncate">{job.title}</p>
                      <p className="text-[12px] text-slate-500 truncate">{job.company} · {job.platform}</p>
                    </div>
                    {job.score !== undefined && job.score !== null && (
                      <ScoreBar score={job.score} />
                    )}
                    <Badge status={job.status}>{job.status}</Badge>
                    <span className="text-[11.5px] text-slate-400 shrink-0 hidden sm:block">
                      {new Date(job.applied_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — Bot control + status */}
        <div className="space-y-4">
          {/* Bot control card */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="heading-4 text-slate-900">Automation</h3>
              <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${botRunning ? "text-emerald-600" : "text-slate-400"}`}>
                <StatusDot status={botRunning ? "running" : "idle"} />
                {botRunning ? "Running" : "Idle"}
              </div>
            </div>

            <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
              {botRunning
                ? "Scanning job boards and submitting applications that match your profile."
                : credentialsMissing
                ? "Connect a platform in Settings to enable automation."
                : "Start the bot to begin automated applications."}
            </p>

            {botError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 mb-4">
                <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-[12px] text-red-700 leading-snug">{botError}</p>
              </div>
            )}

            <button
              onClick={toggleBot}
              disabled={botLoading || (credentialsMissing && !botRunning)}
              className={`w-full h-10 rounded-lg text-[13.5px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
                botRunning
                  ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {botLoading ? (
                "Please wait…"
              ) : botRunning ? (
                <><Square size={13} fill="currentColor" /> Stop automation</>
              ) : (
                <><Play size={13} fill="currentColor" /> Start automation</>
              )}
            </button>

            {credentialsMissing && !botRunning && (
              <Link href="/settings" className="block text-center text-[12px] text-indigo-600 hover:text-indigo-700 mt-3 transition">
                Connect a platform first →
              </Link>
            )}
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="heading-4 text-slate-900 mb-3">Quick access</h3>
            <div className="space-y-1">
              {[
                { href: "/scoring",   label: "Scoring & automation settings" },
                { href: "/resume",    label: "Resume Lab" },
                { href: "/recruiter", label: "Recruiter contacts" },
              ].map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center justify-between px-3 h-9 rounded-lg text-[13px] text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  {l.label}
                  <ExternalLink size={12} className="text-slate-300" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Job detail modal */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedJob(null); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-slate-100">
              <div>
                <h2 className="heading-3 text-slate-900">{selectedJob.title}</h2>
                <p className="text-[13px] text-slate-500 mt-0.5">{selectedJob.company} · {selectedJob.location}</p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M1 1l10 10M11 1L1 11" /></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Platform", value: selectedJob.platform },
                  { label: "Applied", value: new Date(selectedJob.applied_at).toLocaleDateString() },
                  { label: "Status", value: <Badge status={selectedJob.status}>{selectedJob.status}</Badge> },
                  ...(selectedJob.score !== undefined && selectedJob.score !== null
                    ? [{ label: "Match score", value: <ScoreBar score={selectedJob.score} /> }]
                    : []),
                ].map(f => (
                  <div key={f.label}>
                    <p className="caption text-slate-400 mb-1">{f.label}</p>
                    <div className="text-[14px] font-medium text-slate-900">{f.value}</div>
                  </div>
                ))}
              </div>

              {selectedJob.job_url && (
                <a
                  href={selectedJob.job_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-[13.5px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  View job listing
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </DashboardLayout>
  );
}
