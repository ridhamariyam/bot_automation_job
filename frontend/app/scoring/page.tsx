"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";
import { apiFetch, API } from "../lib/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Badge, StatusDot } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { Bot, AlertCircle, Play, Square, Info } from "lucide-react";
import { motion } from "framer-motion";

type ScoringConfig = {
  mode: "aggressive" | "balanced" | "high_quality";
  threshold_override: number | null;
  adaptive_enabled: boolean;
  linkedin_daily: number;
  indeed_daily: number;
  glassdoor_daily: number;
  monster_daily: number;
  google_jobs_daily: number;
};

type BotLog = { timestamp: string; level: string; message: string };

const MODES = [
  { id: "aggressive",    label: "Aggressive",    desc: "Applies broadly — lower score threshold (~40). Good for volume.", threshold: 40 },
  { id: "balanced",      label: "Balanced",      desc: "Default mode — score threshold ~65. Quality and volume balanced.", threshold: 65 },
  { id: "high_quality",  label: "High Quality",  desc: "Only strong matches — threshold ~80. Fewer but more relevant applications.", threshold: 80 },
];

const PLATFORMS = [
  { id: "linkedin",   label: "LinkedIn",   field: "linkedin_daily" },
  { id: "indeed",     label: "Indeed",     field: "indeed_daily" },
  { id: "glassdoor",  label: "Glassdoor",  field: "glassdoor_daily" },
  { id: "monster",    label: "Monster",    field: "monster_daily" },
  { id: "google_jobs",label: "Google Jobs",field: "google_jobs_daily" },
] as const;

function parseExpiredPlatform(msg: string) {
  return msg.match(/SESSION_EXPIRED:([a-z_]+)/i)?.[1]?.toLowerCase() ?? "";
}

export default function ScoringPage() {
  useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [botRunning, setBotRunning] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const [botError, setBotError] = useState("");
  const [botLogs, setBotLogs] = useState<BotLog[]>([]);
  const [credentialsMissing, setCredentialsMissing] = useState(false);

  const refresh = useCallback((em: string) => {
    apiFetch<BotLog[]>(`/api/bot/logs/${encodeURIComponent(em)}?limit=30`)
      .then(l => setBotLogs(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    if (!stored) { router.push("/login"); return; }
    const u = JSON.parse(stored);
    setEmail(u.email);

    Promise.all([
      apiFetch<ScoringConfig>(`/api/scoring/config/${encodeURIComponent(u.email)}`),
      apiFetch<{ running: boolean }>(`/api/bot/status?email=${encodeURIComponent(u.email)}`),
      fetch(`${API}/api/profile/${encodeURIComponent(u.email)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      }).then(r => r.ok ? r.json().catch(() => null) : null),
    ]).then(([cfg, status, profile]) => {
      if (cfg) setConfig(cfg);
      setBotRunning(status?.running ?? false);
      setCredentialsMissing(
        !(profile?.linkedin_session_status === "ready" || profile?.indeed_session_status === "ready")
      );
    }).catch(() => {});

    refresh(u.email);
    const interval = setInterval(() => {
      refresh(u.email);
      apiFetch<{ running: boolean }>(`/api/bot/status?email=${encodeURIComponent(u.email)}`)
        .then(s => setBotRunning(s.running)).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [router, refresh]);

  async function saveConfig() {
    if (!config || !email) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await apiFetch(`/api/scoring/config/${encodeURIComponent(email)}`, {
        method: "POST",
        body: JSON.stringify(config),
      });
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch {
      setSaveMsg("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleBot() {
    setBotLoading(true);
    setBotError("");
    try {
      if (botRunning) {
        const res = await fetch(`${API}/api/bot/stop?email=${encodeURIComponent(email)}`, {
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
          body: JSON.stringify({ email, token, max_jobs: 50 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Could not start bot");
        setBotRunning(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      const expiredPlatform = parseExpiredPlatform(msg);
      if (expiredPlatform) {
        router.push(`/settings?tab=platforms&expired=${encodeURIComponent(expiredPlatform)}`);
        return;
      }
      setBotError(msg);
    } finally {
      setBotLoading(false);
    }
  }

  const updateDaily = (field: string, val: number) => {
    if (!config) return;
    setConfig({ ...config, [field]: Math.max(1, Math.min(200, val)) });
  };

  return (
    <DashboardLayout
      title="Automation"
      actions={
        config && (
          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-4 h-8 rounded-lg text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : saveMsg || "Save settings"}
          </button>
        )
      }
    >
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Left — settings */}
        <div className="lg:col-span-2 space-y-4">

          {/* Bot control */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="heading-4 text-slate-900">Bot automation</h3>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  Start or stop the automated job application bot.
                </p>
              </div>
              <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${botRunning ? "text-emerald-600" : "text-slate-400"}`}>
                <StatusDot status={botRunning ? "running" : "idle"} />
                {botRunning ? "Running" : "Idle"}
              </div>
            </div>

            {botError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 mb-4">
                <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-[12.5px] text-red-700">{botError}</p>
              </div>
            )}

            {credentialsMissing && !botRunning && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 mb-4">
                <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[12.5px] text-amber-700">
                  No connected platforms. Go to <a href="/settings" className="underline font-medium">Settings → Platforms</a> to connect LinkedIn or Indeed.
                </p>
              </div>
            )}

            <button
              onClick={toggleBot}
              disabled={botLoading || (credentialsMissing && !botRunning)}
              className={`flex items-center justify-center gap-2 px-5 h-10 rounded-lg text-[13.5px] font-semibold transition-colors disabled:opacity-50 ${
                botRunning
                  ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {botLoading ? "Please wait…" : botRunning
                ? <><Square size={13} fill="currentColor" /> Stop bot</>
                : <><Play size={13} fill="currentColor" /> Start bot</>
              }
            </button>
          </div>

          {/* Scoring mode */}
          {config && (
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h3 className="heading-4 text-slate-900 mb-1">Scoring mode</h3>
              <p className="text-[13px] text-slate-500 mb-4">Controls which jobs the bot applies to based on match quality.</p>

              <div className="grid sm:grid-cols-3 gap-3">
                {MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setConfig({ ...config, mode: m.id as ScoringConfig["mode"] })}
                    className={`p-4 rounded-xl border text-left transition-colors ${
                      config.mode === m.id
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-3 h-3 rounded-full border-2 ${
                        config.mode === m.id ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                      }`} />
                      <p className={`text-[13px] font-semibold ${config.mode === m.id ? "text-indigo-900" : "text-slate-700"}`}>
                        {m.label}
                      </p>
                    </div>
                    <p className="text-[12px] text-slate-500 leading-relaxed">{m.desc}</p>
                    <p className="text-[11px] text-slate-400 mt-2">Min. score: {m.threshold}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => setConfig({ ...config, adaptive_enabled: !config.adaptive_enabled })}
                    className={`w-9 h-5 rounded-full relative transition-colors ${
                      config.adaptive_enabled ? "bg-indigo-600" : "bg-slate-200"
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      config.adaptive_enabled ? "translate-x-4" : "translate-x-0.5"
                    }`} />
                  </div>
                  <span className="text-[13px] text-slate-700 font-medium">Adaptive threshold</span>
                </label>
                <p className="text-[12px] text-slate-400">
                  Auto-adjusts threshold based on your acceptance rate
                </p>
              </div>
            </div>
          )}

          {/* Daily limits */}
          {config && (
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h3 className="heading-4 text-slate-900 mb-1">Daily application limits</h3>
              <p className="text-[13px] text-slate-500 mb-4">Maximum applications per platform per day. Applies per active session.</p>

              <div className="space-y-3">
                {PLATFORMS.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-4">
                    <span className="text-[13.5px] font-medium text-slate-700 w-28">{p.label}</span>
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="range"
                        min={1}
                        max={100}
                        value={config[p.field]}
                        onChange={e => updateDaily(p.field, parseInt(e.target.value))}
                        className="flex-1 h-1.5 accent-indigo-600"
                      />
                      <span className="text-[13px] font-semibold text-slate-900 tabular-nums w-8 text-right">
                        {config[p.field]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — activity log */}
        <div>
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-50 flex items-center justify-between">
              <h3 className="heading-4 text-slate-900">Activity log</h3>
              {botRunning && (
                <div className="flex items-center gap-1.5">
                  <StatusDot status="running" />
                  <span className="text-[11px] text-emerald-600 font-semibold">Live</span>
                </div>
              )}
            </div>

            {botLogs.length === 0 ? (
              <EmptyState
                icon={<Bot size={18} />}
                title="No activity yet"
                description="Start the bot to see real-time logs here."
              />
            ) : (
              <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-50">
                {botLogs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={
                          log.level === "error" ? "error" :
                          log.level === "success" ? "success" :
                          log.level === "warn" ? "warning" : "muted"
                        }
                        className="shrink-0 mt-0.5"
                      >
                        {log.level}
                      </Badge>
                      <p className="text-[12px] text-slate-600 leading-relaxed break-words">{log.message}</p>
                    </div>
                    <p className="text-[10.5px] text-slate-400 mt-1 pl-0.5">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
