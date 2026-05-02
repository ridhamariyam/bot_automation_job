"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../lib/useAuth";
import { PlatformCard, type PlatformStatus } from "../components/PlatformCard";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}

const API = process.env.NEXT_PUBLIC_API_URL as string;

type Section = "profile" | "platforms" | "screening" | "cv";
type CredStatus = "idle" | "ok" | "expired";
type CredState  = { email: string; verifyStatus: CredStatus; connectedAt?: string };

const PLATFORMS = [
  {
    id: "linkedin",
    name: "LinkedIn",
    tagline: "Easy Apply · millions of jobs worldwide",
    abbr: "in",
    color: "#0A66C2",
  },
  {
    id: "indeed",
    name: "Indeed",
    tagline: "Easily Apply · world's top job board",
    abbr: "II",
    color: "#2164F3",
  },
  // Coming soon
  {
    id: "bayt",
    name: "Bayt.com",
    tagline: "Top job board for MENA & Gulf region",
    abbr: "B",
    color: "#C1272D",
    comingSoon: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    tagline: "Send applications directly via email",
    abbr: "M",
    color: "#EA4335",
    comingSoon: true,
  },
  {
    id: "glassdoor",
    name: "Glassdoor",
    tagline: "Company reviews + Easy Apply",
    abbr: "GD",
    color: "#0CAA41",
    comingSoon: true,
  },
  {
    id: "google_jobs",
    name: "Google Jobs",
    tagline: "Aggregated listings from across the web",
    abbr: "G",
    color: "#4285F4",
    comingSoon: true,
  },
] as const;

const TABS: { id: Section; label: string }[] = [
  { id: "profile",   label: "Profile"   },
  { id: "cv",        label: "Resume"    },
  { id: "platforms", label: "Platforms" },
  { id: "screening", label: "Screening" },
];

function SettingsInner() {
  useAuth();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");

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
    if (requestedTab === "profile" || requestedTab === "platforms" || requestedTab === "screening" || requestedTab === "cv") {
      setActive(requestedTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => setSuccessToast(""), 3500);
    return () => window.clearTimeout(timer);
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
            email:        p[`${plat.id}_email`]    ?? "",
            verifyStatus:
              p[`${plat.id}_verified`]
                ? "ok"
                : sessionStatus === "expired"
                ? "expired"
                : "idle",
            connectedAt: p[`${plat.id}_session_updated_at`] ?? undefined,
          };
        }
        setCreds(init);
      })
      .catch(() => {});
  }, []);

  async function handlePlatformConnect(platform: string, email: string, password: string) {
    // Step 1: save credentials to the database
    const saveRes = await fetch(
      `${API}/api/profile/${encodeURIComponent(userEmail)}/credentials`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          [`${platform}_email`]:    email,
          [`${platform}_password`]: password,
        }),
      }
    );
    if (!saveRes.ok) {
      const d = await saveRes.json().catch(() => ({}));
      throw new Error(d.detail ?? d.error ?? "Could not save credentials");
    }

    // Step 2: attempt Playwright verification (sets verified=True in DB)
    const verifyRes = await fetch(`${API}/api/bot/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform, email, password, user_email: userEmail }),
    });

    const vd = await verifyRes.json().catch(() => ({}));

    // HTTP-level error (500 = Playwright/browser exception, 4xx = bad request)
    if (!verifyRes.ok) {
      const msg: string = vd.detail ?? vd.error ?? "Verification error — try again";
      throw new Error(`Credentials saved. ${msg}`);
    }

    // HTTP 200: check the "ok" field in the response body
    if (vd.ok) {
      setCreds(prev => ({
        ...prev,
        [platform]: {
          email,
          verifyStatus: "ok",
          connectedAt: prev[platform]?.connectedAt,
        },
      }));
      setVerifyPending(prev => { const copy = { ...prev }; delete copy[platform]; return copy; });
      setSuccessToast(`${platformLabel(platform)} ready to use ✅`);
      setError("");
    } else {
      const msg: string = vd.message ?? "";
      // Detect manual verification needed scenarios
      const needsManual = 
        msg.toLowerCase().includes("otp") ||
        msg.toLowerCase().includes("checkpoint") ||
        msg.toLowerCase().includes("challenge") ||
        msg.toLowerCase().includes("manual verification");
      
      if (needsManual) {
        // Set pending & keep credentials for retry
        setVerifyPending(prev => ({ ...prev, [platform]: { email, password } }));
        throw new Error(
          `Credentials saved. This platform requires manual verification.\n\n` +
          `1. Open ${email} in your browser\n` +
          `2. Log in to ${platform}\n` +
          `3. Complete any verification (OTP, security check)\n` +
          `4. Come back and click Retry`
        );
      } else {
        throw new Error(msg || "Verification failed — check your credentials");
      }
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
      const message = data.detail ?? data.error ?? "Could not open browser session";
      if (String(message).toLowerCase().includes("session already in progress")) {
        throw new Error("Connection already in progress...");
      }
      throw new Error(message);
    }
    return data.session_id as string;
  }

  async function handleBrowserConnectComplete(platform: string, sessionId: string) {
    const statusDeadline = Date.now() + 60000;
    let ready = false;
    let lastMessage = "Not logged in yet";

    while (Date.now() < statusDeadline) {
      const statusRes = await fetch(`${API}/api/bot/session/${platform}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const statusData = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) {
        throw new Error(statusData.detail ?? statusData.error ?? "Could not check login status");
      }

      ready = Boolean(statusData.ready);
      lastMessage = statusData.message ?? lastMessage;

      if (ready) break;
      if (
        String(lastMessage).toLowerCase().includes("expired") ||
        String(lastMessage).toLowerCase().includes("closed")
      ) {
        throw new Error(lastMessage);
      }

      await new Promise(resolve => window.setTimeout(resolve, 2000));
    }

    if (!ready) {
      throw new Error(
        "Still not detected.\n\nMake sure:\n• You completed login fully\n• You reached the homepage\n\nThen click Retry"
      );
    }

    const res = await fetch(`${API}/api/bot/session/${platform}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: sessionId, user_email: userEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail ?? data.error ?? "Could not save browser session");
    }
    if (!data.ok) {
      throw new Error(data.message ?? lastMessage ?? "Not logged in yet");
    }

    setCreds(prev => ({
      ...prev,
      [platform]: {
        email: prev[platform]?.email || "",
        verifyStatus: "ok",
        connectedAt: new Date().toISOString(),
      },
    }));
    setVerifyPending(prev => {
      const copy = { ...prev };
      delete copy[platform];
      return copy;
    });
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
    fd.append("name", name);
    fd.append("email", userEmail);
    fd.append("phone", phone);
    fd.append("summary", "");
    fd.append("skills", skills);
    fd.append("targetTitles", targetTitles);
    fd.append("targetLocations", targetLocations);
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
    fd.append("email", userEmail);
    fd.append("name", name);
    fd.append("years_exp", yearsExp);
    fd.append("salary", salary);
    fd.append("notice_period", noticePeriod);
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
    <div className="min-h-screen bg-[#F5F0EA]">

      {/* ── Gradient Hero Header ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #1C1410 0%, #2A1C12 55%, #3E2416 100%)" }}
      >
        {/* Dot grid texture */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />

        <div className="relative max-w-xl mx-auto px-4 pt-5 pb-8">
          {/* Back nav */}
          <div className="flex items-center gap-3 mb-5">
            <Link
              href="/dashboard"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 12L6 8l4-4" />
              </svg>
            </Link>
            <span className="text-white/40 text-sm">Dashboard</span>
          </div>

          {/* Title row */}
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[22px] font-bold text-white tracking-tight">Settings</h1>
              {userEmail && (
                <p className="text-white/45 text-[13px] mt-0.5">{userEmail}</p>
              )}
            </div>
            {connectedCount > 0 && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-white/80 text-[12px] font-medium">
                  {connectedCount} ready
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Floating Tab Bar ── */}
      <div className="max-w-xl mx-auto px-4 -mt-4 relative z-10 mb-5">
        <div className="flex gap-0.5 bg-white rounded-2xl p-1 shadow-[0_4px_20px_rgba(0,0,0,0.10),0_1px_4px_rgba(0,0,0,0.06)]">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={[
                "flex-1 px-2 py-2.5 rounded-xl text-[11px] sm:text-[13px] font-semibold transition-all duration-150 whitespace-nowrap overflow-hidden text-ellipsis",
                active === t.id
                  ? "bg-[#1C1410] text-white shadow-sm"
                  : "text-[#A89F96] hover:text-[#1C1917]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-xl mx-auto px-4 pb-10">
        <form onSubmit={handleSave} className="space-y-4">

          {/* ── PROFILE ── */}
          {active === "profile" && (
            <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-[#1C1917] text-[15px]">Your profile</h2>
                <p className="text-[13px] text-[#A89F96] mt-1 leading-relaxed">Used to tailor applications and auto-fill your name &amp; contact.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                <label className={LBL}>Target job titles <span className="text-[#C4BDB5] font-normal">(comma-separated)</span></label>
                <input value={targetTitles} onChange={e => setTargetTitles(e.target.value)} className={INPUT}
                  placeholder="React Developer, Frontend Engineer" />
              </div>

              <div>
                <label className={LBL}>Target locations <span className="text-[#C4BDB5] font-normal">(one per line)</span></label>
                <textarea value={targetLocations} onChange={e => setTargetLocations(e.target.value)}
                  rows={3} className={INPUT + " resize-none"}
                  placeholder={"Doha, Qatar\nDubai, UAE\nRemote"} />
              </div>

              <div>
                <label className={LBL}>Skills <span className="text-[#C4BDB5] font-normal">(comma-separated)</span></label>
                <input value={skills} onChange={e => setSkills(e.target.value)} className={INPUT}
                  placeholder="React, TypeScript, Node.js" />
              </div>
            </section>
          )}

          {/* ── RESUME ── */}
          {active === "cv" && (
            <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-[#1C1917] text-[15px]">Your resume</h2>
                <p className="text-[13px] text-[#A89F96] mt-1 leading-relaxed">PDF only. Attached to every application automatically.</p>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className={[
                  "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200",
                  cvFile || cvName
                    ? "border-[#1C1917]/25 bg-[#F8F4EF]"
                    : "border-[#DDD7CF] hover:border-[#1C1917]/30 hover:bg-[#F8F4EF]",
                ].join(" ")}
              >
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setCvFile(f); setCvName(f.name); } }} />

                {cvFile || cvName ? (
                  <>
                    <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-[#EDE9E3] flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1C1917" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <p className="text-[14px] font-semibold text-[#1C1917]">{cvName}</p>
                    <p className="text-[12px] text-[#A89F96] mt-1">Click to replace</p>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mb-3 w-12 h-12 rounded-xl bg-[#F0EDE8] flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A89F96" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                      </svg>
                    </div>
                    <p className="text-[14px] font-semibold text-[#1C1917]">Upload your CV</p>
                    <p className="text-[12px] text-[#A89F96] mt-1">PDF · Max 10 MB</p>
                  </>
                )}
              </div>
            </section>
          )}

          {/* ── PLATFORMS ── */}
          {active === "platforms" && (
            <div className="space-y-3">
              {/* Section header */}
              <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                {/* Gradient accent bar */}
                <div
                  className="h-1.5 w-full"
                  style={{ background: "linear-gradient(90deg, #0A66C2, #2164F3, #C1272D, #EA4335)" }}
                />
                <div className="px-5 py-4">
                  <h2 className="font-semibold text-[#1C1917] text-[15px]">Connected platforms</h2>
                  <p className="text-[13px] text-[#A89F96] mt-1 leading-relaxed">
                    The bot applies automatically on platforms marked Ready to use. Browser connect is the recommended path.
                  </p>
                </div>
              </div>

              {/* Active platforms */}
              <div className="space-y-2.5">
                {PLATFORMS.filter(p => !("comingSoon" in p)).map(p => {
                  const isReady = creds[p.id]?.verifyStatus === "ok";
                  const isPending = verifyPending[p.id] !== undefined;
                  const isExpired = creds[p.id]?.verifyStatus === "expired";
                  const status: PlatformStatus = isReady
                    ? "ready"
                    : isPending
                    ? "verify_pending"
                    : isExpired
                    ? "session_expired"
                    : "idle";
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

              {/* Coming soon divider */}
              <div className="flex items-center gap-3 px-1 pt-2">
                <div className="h-px flex-1 bg-[#E8E2DA]" />
                <span className="text-[11px] font-semibold text-[#C0B8AF] uppercase tracking-widest">
                  Coming soon
                </span>
                <div className="h-px flex-1 bg-[#E8E2DA]" />
              </div>

              {/* Coming-soon platforms */}
              <div className="space-y-2.5">
                {PLATFORMS.filter(p => "comingSoon" in p && p.comingSoon).map(p => (
                  <PlatformCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    tagline={p.tagline}
                    abbr={p.abbr}
                    brandColor={p.color}
                    status="coming_soon"
                    onConnect={handlePlatformConnect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── SCREENING ── */}
          {active === "screening" && (
            <section className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)] p-6 space-y-5">
              <div>
                <h2 className="font-semibold text-[#1C1917] text-[15px]">Screening defaults</h2>
                <p className="text-[13px] text-[#A89F96] mt-1 leading-relaxed">Auto-fills common application questions.</p>
              </div>

              <div>
                <label className={LBL}>Years of experience</label>
                <input type="number" min="0" max="40" value={yearsExp}
                  onChange={e => setYearsExp(e.target.value)} className={INPUT} />
              </div>

              <div>
                <label className={LBL}>Expected salary <span className="text-[#C4BDB5] font-normal">(₹ per year)</span></label>
                <input type="number" value={salary}
                  onChange={e => setSalary(e.target.value)} className={INPUT} placeholder="800000" />
                <p className="text-[12px] text-[#B0A89E] mt-1.5">e.g. 800000 = ₹8 LPA</p>
              </div>

              <div>
                <label className={LBL}>Notice period <span className="text-[#C4BDB5] font-normal">(days)</span></label>
                <input type="number" min="0" value={noticePeriod}
                  onChange={e => setNoticePeriod(e.target.value)} className={INPUT} placeholder="30" />
              </div>
            </section>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-xl bg-[#FEF5F2] border border-[#FDDDD5] text-[13px] text-[#C0392B] leading-snug break-words overflow-hidden whitespace-pre-line">
              {error}
            </div>
          )}

          {/* Save button */}
          {showSaveButton && (
            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 rounded-2xl text-[14px] font-semibold text-white
                disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
              style={{
                background: saving || saved
                  ? "#7A716B"
                  : "linear-gradient(135deg, #1C1917 0%, #3E2416 100%)",
                boxShadow: "0 4px 20px rgba(28,25,23,0.25), 0 1px 4px rgba(28,25,23,0.15)",
              }}
            >
              {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
            </button>
          )}
        </form>
      </div>

      {successToast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-[#1C1410] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
          aria-live="polite"
        >
          {successToast}
        </div>
      )}
    </div>
  );
}

function platformLabel(platform: string) {
  return PLATFORMS.find((item) => item.id === platform)?.name ?? platform;
}

function formatConnectedAt(timestamp?: string) {
  if (!timestamp) return "";

  const connectedAt = new Date(timestamp);
  const diffMs = Date.now() - connectedAt.getTime();

  if (Number.isNaN(connectedAt.getTime()) || diffMs < 0) {
    return "";
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Connected just now";
  if (diffMinutes < 60) {
    return `Connected ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Connected ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Connected ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

const INPUT = [
  "w-full border border-[#EDE9E3] rounded-xl px-4 py-3 text-[14px] outline-none",
  "focus:border-[#1C1917] focus:shadow-[0_0_0_3px_rgba(28,25,23,0.07)]",
  "bg-[#FAFAF8] placeholder:text-[#C4BDB5] transition-all duration-150",
].join(" ");

const LBL = "block text-[12px] font-semibold text-[#A89F96] mb-1.5 uppercase tracking-wide";
