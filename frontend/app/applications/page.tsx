"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";
import { apiFetch } from "../lib/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonRow } from "../components/ui/Skeleton";
import { Search, Filter, Briefcase, ExternalLink } from "lucide-react";

type Job = {
  id: string; title: string; company: string; location: string;
  platform: string; status: string; applied_at: string;
  job_url?: string; score?: number;
};

const STATUSES = ["All", "Applied", "Viewed", "Interview", "Offer", "Rejected"];
const PLATFORMS = ["All", "linkedin", "indeed", "glassdoor", "monster", "google_jobs"];

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] text-slate-400 tabular-nums w-6">{score}</span>
    </div>
  );
}

export default function ApplicationsPage() {
  useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [platformFilter, setPlatformFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    if (!stored) { router.push("/login"); return; }
    const u = JSON.parse(stored);
    apiFetch<Job[]>(`/api/jobs/${encodeURIComponent(u.email)}`)
      .then(d => setJobs(Array.isArray(d) ? d : []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [router]);

  async function updateStatus(jobId: string, status: string) {
    const prev = jobs.find(j => j.id === jobId)?.status ?? "";
    setUpdatingStatus(jobId);
    setJobs(p => p.map(j => j.id === jobId ? { ...j, status } : j));
    if (selectedJob?.id === jobId) setSelectedJob(p => p ? { ...p, status } : null);
    try {
      await apiFetch(`/api/jobs/${jobId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {
      // Revert optimistic update on failure
      setJobs(p => p.map(j => j.id === jobId ? { ...j, status: prev } : j));
      if (selectedJob?.id === jobId) setSelectedJob(p => p ? { ...p, status: prev } : null);
    } finally {
      setUpdatingStatus(null);
    }
  }

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !q || j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || j.status === statusFilter;
    const matchPlatform = platformFilter === "All" || j.platform === platformFilter;
    return matchSearch && matchStatus && matchPlatform;
  });

  const totalByStatus = STATUSES.filter(s => s !== "All").reduce((acc, s) => {
    acc[s] = jobs.filter(j => j.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <DashboardLayout title="Applications">
      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or company…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 h-9 rounded-lg border text-[13px] font-medium transition-colors ${
            showFilters || statusFilter !== "All" || platformFilter !== "All"
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Filter size={13} />
          Filters
          {(statusFilter !== "All" || platformFilter !== "All") && (
            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center">
              {(statusFilter !== "All" ? 1 : 0) + (platformFilter !== "All" ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Filter dropdowns */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-5 p-4 bg-white rounded-xl border border-slate-100">
          <div>
            <p className="caption text-slate-400 mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium border transition-colors ${
                    statusFilter === s
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {s} {s !== "All" && totalByStatus[s] > 0 && <span className="opacity-50">({totalByStatus[s]})</span>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="caption text-slate-400 mb-2">Platform</p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium border transition-colors capitalize ${
                    platformFilter === p
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {p.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="flex items-center gap-4 mb-4">
        <p className="text-[12.5px] text-slate-500">
          {loading ? "Loading…" : `${filtered.length} of ${jobs.length} applications`}
        </p>
        {(search || statusFilter !== "All" || platformFilter !== "All") && (
          <button
            onClick={() => { setSearch(""); setStatusFilter("All"); setPlatformFilter("All"); }}
            className="text-[12px] text-indigo-600 hover:text-indigo-700 transition"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="px-5 py-2">
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={20} />}
            title={jobs.length === 0 ? "No applications yet" : "No results"}
            description={jobs.length === 0 ? "Start the bot from the dashboard to begin applying." : "Try adjusting your search or filters."}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Role / Company", "Platform", "Score", "Status", "Date", ""].map(h => (
                      <th key={h} className="px-5 py-3 text-left caption text-slate-400 first:pl-5 last:pr-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(job => (
                    <tr key={job.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="text-[13.5px] font-medium text-slate-900 leading-snug">{job.title}</p>
                        <p className="text-[12px] text-slate-500 mt-0.5">{job.company} · {job.location || "—"}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-[12.5px] text-slate-500 capitalize">{job.platform.replace("_", " ")}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {job.score !== undefined && job.score !== null
                          ? <ScoreBar score={job.score} />
                          : <span className="text-[12px] text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={job.status}
                          disabled={updatingStatus === job.id}
                          onChange={e => updateStatus(job.id, e.target.value)}
                          className="text-[12px] rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition disabled:opacity-50 cursor-pointer"
                        >
                          {["Applied", "Viewed", "Interview", "Offer", "Rejected"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-slate-400">
                        {new Date(job.applied_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="text-[12px] font-medium text-slate-500 hover:text-slate-800 transition"
                          >
                            Details
                          </button>
                          {job.job_url && (
                            <a
                              href={job.job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-slate-600 transition"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-50">
              {filtered.map(job => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="w-full flex items-start justify-between gap-3 px-4 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-slate-900 truncate">{job.title}</p>
                    <p className="text-[12px] text-slate-500 mt-0.5 truncate">{job.company} · {job.platform}</p>
                    <p className="text-[11.5px] text-slate-400 mt-1">
                      {new Date(job.applied_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge status={job.status}>{job.status}</Badge>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail modal */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedJob(null); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-slate-100">
              <div>
                <h2 className="heading-3 text-slate-900">{selectedJob.title}</h2>
                <p className="text-[13px] text-slate-500 mt-0.5">{selectedJob.company} · {selectedJob.location || "—"}</p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M1 1l10 10M11 1L1 11" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Platform",   value: selectedJob.platform },
                  { label: "Applied",    value: new Date(selectedJob.applied_at).toLocaleDateString() },
                  { label: "Status",     value: <Badge status={selectedJob.status}>{selectedJob.status}</Badge> },
                  ...(selectedJob.score !== undefined && selectedJob.score !== null
                    ? [{ label: "Match score", value: <ScoreBar score={selectedJob.score} /> }]
                    : []),
                ].map(f => (
                  <div key={f.label}>
                    <p className="caption text-slate-400 mb-1">{f.label}</p>
                    <div className="text-[13.5px] font-medium text-slate-900">{f.value}</div>
                  </div>
                ))}
              </div>
              <div>
                <p className="caption text-slate-400 mb-2">Update status</p>
                <div className="flex flex-wrap gap-2">
                  {["Applied", "Viewed", "Interview", "Offer", "Rejected"].map(s => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selectedJob.id, s)}
                      disabled={updatingStatus === selectedJob.id}
                      className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium border transition-colors disabled:opacity-50 ${
                        selectedJob.status === s
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
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
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
