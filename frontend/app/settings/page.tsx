"use client";
import Link from "next/link";
import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../lib/useAuth";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { PlatformCard, type PlatformStatus } from "../components/PlatformCard";

const API = process.env.NEXT_PUBLIC_API_URL as string;

type Section = "profile" | "platforms" | "screening" | "cv";
type CredStatus = "idle" | "ok" | "expired";
type CredState = { email: string; verifyStatus: CredStatus; connectedAt?: string };

const PLATFORMS = [
  { id: "linkedin",  name: "LinkedIn",    tagline: "Easy Apply · millions of jobs worldwide", abbr: "in", color: "#0A66C2" },
  { id: "indeed",    name: "Indeed",      tagline: "Easily Apply · world's top job board",    abbr: "II", color: "#2164F3" },
  { id: "bayt",      name: "Bayt.com",    tagline: "Top job board for MENA & Gulf region",    abbr: "B",  color: "#C1272D", comingSoon: true },
  { id: "gmail",     name: "Gmail",       tagline: "Send applications directly via email",    abbr: "M",  color: "#EA4335", comingSoon: true },
  { id: "glassdoor", name: "Glassdoor",   tagline: "Company reviews + Easy Apply",            abbr: "GD", color: "#0CAA41", comingSoon: true },
  { id: "google_jobs",name:"Google Jobs", tagline: "Aggregated listings from across the web", abbr: "G",  color: "#4285F4", comingSoon: true },
] as const;

const TABS: { id: Section; label: string }[] = [
  { id: "profile",   label: "Profile"   },
  { id: "cv",        label: "Resume"    },
  { id: "platforms", label: "Platforms" },
  { id: "screening", label: "Screening" },
];

const INPUT = "w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition";
const TEXTAREA = "w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none";
const LBL = "block text-[12px] font-semibold text-slate-500 mb-1.5";

function platformLabel(platform: string) {
  return PLATFORMS.find(p => p.id === platform)?.name ?? platform;
}

function formatConnectedAt(timestamp?: string) {
  if (!timestamp) return "";
  const connectedAt = new Date(timestamp);
  const diffMs = Date.now() - connectedAt.getTime();
  if (Number.isNaN(connectedAt.getTime()) || diffMs < 0) return "";
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Connected just now";
  if (diffMinutes < 60) return `Connected ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Connected ${diffHours}h ago`;
  return `Connected ${Math.floor(diffHours / 24)}d ago`;
}

function SettingsInner() {
  useAuth();
  const searchParams = useSearchParams();

  const [userEmail, setUserEmail] = useState("");
  const [token, setToken]         = useState("");
  const [active, setActive]       = useState<Section>("profile");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");
  const [successToast, setSuccessToast] = useState("");

  // Profile
  const [name, setName]                       = useState("");
  const [phone, setPhone]                     = useState("");
  const [targetTitles, setTargetTitles]       = useState("");
  const [targetLocations, setTargetLocations] = useState("");
  const [skills, setSkills]                   = useState("");

  // CV
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvName, setCvName] = useState("");
  const fileRef             = useRef<HTMLInputElement>(null);

  // Screening
  const [yearsExp, setYearsExp]         = useState("2");
  const [salary, setSalary]             = useState("800000");
  const [noticePeriod, setNoticePeriod] = useState("30");

  // Platform credentials
  const [creds, setCreds] = useState<Record<string, CredState>>({});
  const [verifyPending, setVerifyPending] = useState<Record<string, { email: string; password: string }>>({});

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "profile" || tab === "platforms" || tab === "screening" || tab === "cv") {
      setActive(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!successToast) return;
    const t = window.setTimeout(() => setSuccessToast(""), 3500);
    return () => window.clearTimeout(t);
  }, [successToast]);

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    const tok    = localStorage.getItem("token") ?? "";
    if (!stored) return;
    const u = JSON.parse(stored);
    setUserEmail(u.email);
    setToken(tok);
    setName(u.name ?? "");

    fetch(`${API}/api/profile/${encodeURIComponent(u.email)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (!p) return;
        setPhone(p.phone ?? "");
        setTargetTitles((p.target_titles ?? []).join(", "));
        setTargetLocations((p.target_locations ?? []).join("\n"));
        setSkills((p.skills ?? []).join(", "));
        if (p.cv_path) setCvName(p.cv_path.split("/").pop() ?? "");
        if (p.years_exp     != null) setYearsExp(String(p.years_exp));
        if (p.salary        != null) setSalary(String(p.salary));
        if (p.notice_period != null) setNoticePeriod(String(p.notice_period));

        const init: Record<string, CredState> = {};
        for (const plat of PLATFORMS) {
          const sessionStatus = p[`${plat.id}_session_status`] ?? "missing";
          init[plat.id] = {
            email: p[`${plat.id}_email`] ?? "",
            verifyStatus: p[`${plat.id}_verified`]
              ? "ok"
              : sessionStatus === "expired" ? "expired" : "idle",
            connectedAt: p[`${plat.id}_session_updated_at`] ?? undefined,
          };
        }
        setCreds(init);
      })
      .catch(() => {});
  }, []);

  async function handlePlatformConnect(platform: string, email: string, password: string) {
    const saveRes = await fetch(
      `${API}/api/profile/${encodeURIComponent(userEmail)}/credentials`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [`${platform}_email`]: email, [`${platform}_password`]: password }),
      }
    );
    if (!saveRes.ok) {
      const d = await saveRes.json().catch(() => ({}));
      throw new Error(d.detail ?? d.error ?? "Could not save credentials");
    }

    const verifyRes = await fetch(`${API}/api/bot/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform, email, password, user_email: userEmail }),
    });
    const vd = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok) {
      throw new Error(`Credentials saved. ${vd.detail ?? vd.error ?? "Verification error"}`);
    }

    if (vd.ok) {
      setCreds(prev => ({ ...prev, [platform]: { email, verifyStatus: "ok", connectedAt: prev[platform]?.connectedAt } }));
      setVerifyPending(prev => { const c = { ...prev }; delete c[platform]; return c; });
      setSuccessToast(`${platformLabel(platform)} ready to use ✅`);
      setError("");
    } else {
      const msg: string = vd.message ?? "";
      const needsManual = ["otp", "checkpoint", "challenge", "manual verification"].some(k => msg.toLowerCase().includes(k));
      if (needsManual) {
        setVerifyPending(prev => ({ ...prev, [platform]: { email, password } }));
        throw new Error(`Credentials saved. Manual verification required.\n\n1. Log in to ${email}\n2. Complete ${platform} verification\n3. Come back and click Retry`);
      }
      throw new Error(msg || "Verification failed — check your credentials");
    }
  }

  async function handleBrowserConnectStart(platform: string) {
    const res = await fetch(`${API}/api/bot/session/${platform}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user_email: userEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.detail ?? data.error ?? "Could not open browser session";
      if (String(msg).toLowerCase().includes("session already in progress")) throw new Error("Connection already in progress…");
      throw new Error(msg);
    }
    return data.session_id as string;
  }

  async function handleBrowserConnectComplete(platform: string, sessionId: string) {
    const deadline = Date.now() + 60000;
    let ready = false;
    let lastMessage = "Not logged in yet";
    while (Date.now() < deadline) {
      const statusRes = await fetch(`${API}/api/bot/session/${platform}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const statusData = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(statusData.detail ?? "Could not check login status");
      ready = Boolean(statusData.ready);
      lastMessage = statusData.message ?? lastMessage;
      if (ready) break;
      if (["expired", "closed"].some(k => String(lastMessage).toLowerCase().includes(k))) throw new Error(lastMessage);
      await new Promise(r => window.setTimeout(r, 2000));
    }
    if (!ready) throw new Error("Not detected. Complete login fully, then click Retry.");
    const res = await fetch(`${API}/api/bot/session/${platform}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: sessionId, user_email: userEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail ?? "Could not save browser session");
    if (!data.ok) throw new Error(data.message ?? lastMessage);
    setCreds(prev => ({ ...prev, [platform]: { email: prev[platform]?.email || "", verifyStatus: "ok", connectedAt: new Date().toISOString() } }));
    setVerifyPending(prev => { const c = { ...prev }; delete c[platform]; return c; });
    setSuccessToast(`${platformLabel(platform)} ready to use ✅`);
    setError("");
  }

  async function handleBrowserConnectCancel(platform: string, sessionId: string) {
    await fetch(`${API}/api/bot/session/${platform}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => {});
  }

  async function saveProfile() {
    const fd = new FormData();
    fd.append("name", name); fd.append("email", userEmail); fd.append("phone", phone);
    fd.append("summary", ""); fd.append("skills", skills);
    fd.append("targetTitles", targetTitles); fd.append("targetLocations", targetLocations);
    if (cvFile) fd.append("cv", cvFile);
    const res = await fetch(`${API}/api/profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error((await res.json()).detail ?? "Profile save failed");
    const p = await res.json();
    const stored = JSON.parse(localStorage.getItem("jobrocket_user") ?? "{}");
    localStorage.setItem("jobrocket_user", JSON.stringify({ ...stored, ...p }));
  }

  async function saveScreening() {
    const fd = new FormData();
    fd.append("email", userEmail); fd.append("name", name);
    fd.append("years_exp", yearsExp); fd.append("salary", salary); fd.append("notice_period", noticePeriod);
    const res = await fetch(`${API}/api/profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) throw new Error("Save failed");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    try {
      if (active === "profile" || active === "cv") await saveProfile();
      else if (active === "screening") await saveScreening();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving");
    } finally {
      setSaving(false);
    }
  }

  const connectedCount = Object.values(creds).filter(c => c.verifyStatus === "ok").length;
  const showSaveButton = active !== "platforms";

  return (
    <DashboardLayout
      title="Settings"
      actions={
        userEmail ? <span className="text-[12px] text-slate-400 hidden sm:block">{userEmail}</span> : undefined
      }
    >
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              active === t.id ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {t.id === "platforms" && connectedCount > 0 && (
              <span className={`ml-1.5 text-[11px] ${active === "platforms" ? "text-emerald-400" : "text-emerald-600"}`}>
                {connectedCount} connected
              </span>
            )}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="max-w-2xl space-y-4">
        {/* ── PROFILE ── */}
        {active === "profile" && (
          <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">
            <div>
              <h2 className="heading-4 text-slate-900">Your profile</h2>
              <p className="text-[13px] text-slate-500 mt-1">Used to tailor applications and auto-fill your name and contact.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Full name</label>
                <input value={name} onChange={e => setName(e.target.value)} required className={INPUT} placeholder="Your name" />
              </div>
              <div>
                <label className={LBL}>Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} placeholder="+974 50 000 000" />
              </div>
            </div>
            <div>
              <label className={LBL}>Target job titles <span className="text-slate-400 font-normal">(comma-separated)</span></label>
              <input value={targetTitles} onChange={e => setTargetTitles(e.target.value)} className={INPUT} placeholder="React Developer, Frontend Engineer" />
            </div>
            <div>
              <label className={LBL}>Target locations <span className="text-slate-400 font-normal">(one per line)</span></label>
              <textarea value={targetLocations} onChange={e => setTargetLocations(e.target.value)} rows={3} className={TEXTAREA} placeholder={"Doha, Qatar\nDubai, UAE\nRemote"} />
            </div>
            <div>
              <label className={LBL}>Skills <span className="text-slate-400 font-normal">(comma-separated)</span></label>
              <input value={skills} onChange={e => setSkills(e.target.value)} className={INPUT} placeholder="React, TypeScript, Node.js" />
            </div>
          </div>
        )}

        {/* ── RESUME ── */}
        {active === "cv" && (
          <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">
            <div>
              <h2 className="heading-4 text-slate-900">Your resume</h2>
              <p className="text-[13px] text-slate-500 mt-1">PDF only. Attached to every application automatically.</p>
            </div>
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                cvFile || cvName ? "border-indigo-200 bg-indigo-50/50" : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
              }`}
            >
              <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setCvFile(f); setCvName(f.name); } }} />
              {cvFile || cvName ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-slate-800">{cvName}</p>
                  <p className="text-[12px] text-slate-400">Click to replace</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-slate-700">Upload your CV</p>
                  <p className="text-[12px] text-slate-400">PDF · Max 10 MB</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PLATFORMS ── */}
        {active === "platforms" && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h2 className="heading-4 text-slate-900 mb-1">Connected platforms</h2>
              <p className="text-[13px] text-slate-500">
                The bot applies automatically on platforms marked Ready. Browser connect is the recommended path.
              </p>
            </div>
            <div className="space-y-2.5">
              {PLATFORMS.filter(p => !("comingSoon" in p)).map(p => {
                const isReady   = creds[p.id]?.verifyStatus === "ok";
                const isPending = verifyPending[p.id] !== undefined;
                const isExpired = creds[p.id]?.verifyStatus === "expired";
                const status: PlatformStatus = isReady ? "ready" : isPending ? "verify_pending" : isExpired ? "session_expired" : "idle";
                return (
                  <PlatformCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    tagline={p.tagline}
                    abbr={p.abbr}
                    brandColor={p.color}
                    status={status}
                    email={verifyPending[p.id]?.email || creds[p.id]?.email}
                    connectedAtLabel={formatConnectedAt(creds[p.id]?.connectedAt)}
                    onConnect={handlePlatformConnect}
                    onRetryVerify={handlePlatformConnect}
                    onBrowserConnectStart={handleBrowserConnectStart}
                    onBrowserConnectComplete={handleBrowserConnectComplete}
                    onBrowserConnectCancel={handleBrowserConnectCancel}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-3 px-1 pt-1">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="caption text-slate-400">Coming soon</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="space-y-2.5">
              {PLATFORMS.filter(p => "comingSoon" in p && p.comingSoon).map(p => (
                <PlatformCard key={p.id} id={p.id} name={p.name} tagline={p.tagline} abbr={p.abbr} brandColor={p.color} status="coming_soon" onConnect={handlePlatformConnect} />
              ))}
            </div>
          </div>
        )}

        {/* ── SCREENING ── */}
        {active === "screening" && (
          <div className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">
            <div>
              <h2 className="heading-4 text-slate-900">Screening defaults</h2>
              <p className="text-[13px] text-slate-500 mt-1">Auto-fills common application form questions.</p>
            </div>
            <div>
              <label className={LBL}>Years of experience</label>
              <input type="number" min="0" max="40" value={yearsExp} onChange={e => setYearsExp(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LBL}>Expected salary <span className="text-slate-400 font-normal">(₹ per year)</span></label>
              <input type="number" value={salary} onChange={e => setSalary(e.target.value)} className={INPUT} placeholder="800000" />
              <p className="text-[12px] text-slate-400 mt-1">e.g. 800000 = ₹8 LPA</p>
            </div>
            <div>
              <label className={LBL}>Notice period <span className="text-slate-400 font-normal">(days)</span></label>
              <input type="number" min="0" value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} className={INPUT} placeholder="30" />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-[13px] text-red-700 whitespace-pre-line leading-relaxed">
            {error}
          </div>
        )}

        {/* Save button */}
        {showSaveButton && (
          <button
            type="submit"
            disabled={saving}
            className={`px-6 h-10 rounded-lg text-[13.5px] font-semibold transition-colors ${
              saved ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
            } disabled:opacity-60`}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
          </button>
        )}
      </form>

      <div className="mt-6 flex items-center gap-3">
        <p className="text-[12px] text-slate-400">All features included · Premium plan</p>
        <Link href="/billing" className="text-[12px] text-indigo-600 hover:text-indigo-700 font-medium transition">
          View billing →
        </Link>
      </div>

      {/* Success toast */}
      {successToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-[13px] font-medium text-white shadow-lg">
          {successToast}
        </div>
      )}
    </DashboardLayout>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
