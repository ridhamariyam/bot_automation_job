"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, logout } from "../lib/useAuth";

type UserProfile = {
  name: string;
  email: string;
};

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

async function apiFetch(path: string) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
    if (!stored) {
      router.push("/login");
      return;
    }
    const u = JSON.parse(stored);
    setUser(u);

    // Check if profile is complete with LinkedIn credentials
    fetch(`${API}/api/profile/${encodeURIComponent(u.email)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((p) => {
        // Check if credentials are missing for all platforms
        if (!p?.linkedin_email || !p?.linkedin_password) {
          setCredentialsMissing(true);
        } else {
          setCredentialsMissing(false);
        }
        refreshData(u.email);
      })
      .catch(() => {
        refreshData(u.email);
      });

    // Check bot status
    apiFetch(`/api/bot/status?email=${encodeURIComponent(u.email)}`)
      .then((s: { running: boolean }) => setBotRunning(s.running))
      .catch(() => {});

    // Poll every 10s
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
        await apiFetch(
          `/api/bot/stop?email=${encodeURIComponent(user.email)}`
        );
        setBotRunning(false);
      } else {
        const token = localStorage.getItem("token") ?? "";
        const res = await fetch(`${API}/api/bot/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: user.email,
            token,
            max_jobs: 50,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Could not start bot");
        setBotRunning(true);
      }
    } catch (err: unknown) {
      setBotError(err instanceof Error ? err.message : "Error");
    } finally {
      setBotLoading(false);
    }
  };

  const appliedToday = Object.entries(stats.by_status).reduce(
    (sum, [status, count]) => (status === "Applied" ? sum + count : sum),
    0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              🚀 JobRocket Dashboard
            </h1>
            <p className="text-sm text-gray-600">
              {user ? `Welcome back, ${user.name}!` : "Loading..."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/scoring" className="text-sm font-medium text-emerald-600 hover:text-emerald-800">
              Smart Scoring
            </Link>
            <Link href="/resume" className="text-sm font-medium text-purple-600 hover:text-purple-800">
              Resume Builder
            </Link>
            <Link href="/recruiter" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              Recruiter Contacts
            </Link>
            <button
              onClick={() => logout(router)}
              className="text-gray-600 hover:text-gray-900 text-sm underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Credentials Missing Banner */}
        {credentialsMissing && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-semibold text-amber-900">Platform credentials needed</h3>
              <p className="text-sm text-amber-800 mt-1">Add your LinkedIn (or other platform) credentials in Settings to start applying to jobs.</p>
              <Link href="/settings" className="inline-block mt-2 text-sm font-semibold text-amber-700 hover:text-amber-900 underline">
                Go to Settings →
              </Link>
            </div>
          </div>
        )}

        {/* Status Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Bot Status Card */}
          <div className="bg-white rounded-2xl shadow-md p-6 border-2 border-blue-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Bot Status</h2>
              <div
                className={`w-3 h-3 rounded-full ${
                  botRunning ? "bg-green-500 animate-pulse" : "bg-gray-300"
                }`}
              />
            </div>

            <div className="mb-6">
              <div
                className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                  botRunning
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {botRunning ? "✓ Running" : "○ Stopped"}
              </div>
            </div>

            <p className="text-gray-600 text-sm mb-6">
              {botRunning
                ? "The bot is actively applying to jobs on LinkedIn. Check back here for updates!"
                : "The bot is not running. Click Start to begin applying to jobs."}
            </p>

            {botError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm">
                ⚠️ {botError}
              </div>
            )}

            <button
              onClick={toggleBot}
              disabled={botLoading}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition ${
                botRunning
                  ? "bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white"
                  : "bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white"
              }`}
            >
              {botLoading
                ? "Loading..."
                : botRunning
                  ? "Stop Applying"
                  : "Start Applying 🚀"}
            </button>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Quick Stats</h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <span className="text-gray-600">Total Applications</span>
                <span className="text-2xl font-bold text-blue-600">
                  {stats.total}
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <span className="text-gray-600">Applied Today</span>
                <span className="text-2xl font-bold text-green-600">
                  {appliedToday}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">Viewed</span>
                <span className="text-2xl font-bold text-yellow-600">
                  {stats.by_status["Viewed"] || 0}
                </span>
              </div>
            </div>

            <Link
              href="/settings"
              className="block text-center text-blue-600 hover:text-blue-700 text-sm font-medium mt-6 pt-4 border-t border-gray-200"
            >
              Edit Profile & Credentials →
            </Link>
          </div>
        </div>

        {/* Jobs List */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            Recent Applications ({jobs.length})
          </h2>

          {jobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-2">No applications yet.</p>
              <p className="text-sm text-gray-500 mb-4">
                {credentialsMissing 
                  ? "Add your platform credentials in Settings to start applying." 
                  : "Click 'Start Applying' above to begin submitting applications."}
              </p>
              {credentialsMissing && (
                <Link
                  href="/settings"
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition"
                >
                  Add Credentials
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b-2 border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Job
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Company
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Apply Method
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Date
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {jobs.slice(0, 20).map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50 transition">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{job.title}</div>
                        <div className="text-xs text-gray-500">{job.location}</div>
                      </td>
                      <td className="py-3 px-4 text-gray-700">{job.company}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                          {job.proof?.includes("email") || job.proof?.includes("gmail") ? "📧 Email" : "🔗 LinkedIn"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            job.status === "Applied"
                              ? "bg-blue-100 text-blue-700"
                              : job.status === "Viewed"
                                ? "bg-yellow-100 text-yellow-700"
                                : job.status === "Interview"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {new Date(job.applied_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 space-x-2">
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="text-blue-600 hover:text-blue-700 font-medium text-xs hover:underline"
                        >
                          Details
                        </button>
                        {job.has_tailored_resume && (
                          <a
                            href={`${API}/api/jobs/${job.id}/tailored-resume/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-700 font-medium text-xs hover:underline"
                          >
                            CV PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {jobs.length > 20 && (
                <div className="text-center py-4 text-gray-600 text-sm">
                  Showing 20 of {jobs.length} applications
                </div>
              )}
            </div>
          )}
        </div>

        {/* Job Details Modal */}
        {selectedJob && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Application Details
                  </h2>
                  <button
                    onClick={() => setSelectedJob(null)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Job Info */}
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {selectedJob.title}
                    </h3>
                    <p className="text-gray-600">{selectedJob.company}</p>
                    <p className="text-sm text-gray-500">{selectedJob.location}</p>
                  </div>

                  {/* Application Details */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-semibold text-gray-500 uppercase">
                        Platform
                      </p>
                      <p className="text-gray-900 font-medium">{selectedJob.platform}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-500 uppercase">
                        Status
                      </p>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold inline-block ${
                          selectedJob.status === "Applied"
                            ? "bg-blue-100 text-blue-700"
                            : selectedJob.status === "Viewed"
                              ? "bg-yellow-100 text-yellow-700"
                              : selectedJob.status === "Interview"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {selectedJob.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-500 uppercase">
                        Applied Date
                      </p>
                      <p className="text-gray-900 font-medium">
                        {new Date(selectedJob.applied_at).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-500 uppercase">
                        Application Method
                      </p>
                      <p className="text-gray-900 font-medium">
                        {selectedJob.proof?.includes("email") ||
                        selectedJob.proof?.includes("gmail")
                          ? "📧 Email Submission"
                          : "🔗 LinkedIn Easy Apply"}
                      </p>
                    </div>
                  </div>

                  {/* Application Proof/Details */}
                  {selectedJob.proof && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-semibold text-gray-500 uppercase mb-2">
                        Application Proof
                      </p>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap break-words">
                        {selectedJob.proof}
                      </p>
                    </div>
                  )}

                  {/* Job Link */}
                  {selectedJob.job_url && (
                    <div>
                      <a
                        href={selectedJob.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition"
                      >
                        View Job on LinkedIn →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bot Activity Feed */}
        {botRunning && botLogs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              🤖 Bot Activity (Live)
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {botLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 p-3 rounded-lg ${
                    log.level === "error"
                      ? "bg-red-50 text-red-700"
                      : log.level === "success"
                        ? "bg-green-50 text-green-700"
                        : log.level === "warn"
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-blue-50 text-blue-700"
                  }`}
                >
                  <span className="text-sm font-medium flex-shrink-0">
                    {log.level === "error"
                      ? "❌"
                      : log.level === "success"
                        ? "✅"
                        : log.level === "warn"
                          ? "⚠️"
                          : "ℹ️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {log.message}
                    </p>
                    <p className="text-xs opacity-75 mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl shadow-md p-6 border border-blue-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Need Help?</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>
              • Make sure you've completed your profile setup with LinkedIn
              credentials
            </li>
            <li>• The bot applies to jobs matching your titles and locations</li>
            <li>
              • Check back periodically to see your application results
            </li>
            <li>
              • For email-required applications, the bot will use your Gmail
              account
            </li>
            <li>
              • The activity log below shows real-time updates from the bot
            </li>
            <li>
              • If you encounter any issues, please contact support at{" ridhamariyam44@gmail.com or +974 7085 8175"}
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
