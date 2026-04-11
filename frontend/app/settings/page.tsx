"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL as string;
type Section = "profile" | "platforms" | "screening" | "cv";
type VerifyStatus = "idle" | "checking" | "ok" | "fail";

const PLATFORM_META: Record<string, { label: string; color: string; abbr: string; subtitle: string }> = {
  linkedin:   { label: "LinkedIn",   color: "bg-[#0077B5]", abbr: "in", subtitle: "Easy Apply jobs" },
  indeed:     { label: "Indeed",     color: "bg-[#003A9B]", abbr: "II", subtitle: "Easily Apply jobs" },
  glassdoor:  { label: "Glassdoor",  color: "bg-[#0CAA41]", abbr: "GD", subtitle: "Easy Apply jobs" },
  monster:    { label: "Monster",    color: "bg-[#6B0FAC]", abbr: "M",  subtitle: "Apply via Monster" },
  google_jobs:{ label: "Google Jobs",color: "bg-[#EA4335]", abbr: "G",  subtitle: "Redirects to ATS pages" },
  naukri:     { label: "Naukri",     color: "bg-[#FF7555]", abbr: "N",  subtitle: "Indian job board" },
  bayt:       { label: "Bayt",       color: "bg-[#005BAC]", abbr: "B",  subtitle: "Middle East jobs" },
  timesjobs:  { label: "TimesJobs",  color: "bg-[#E83030]", abbr: "TJ", subtitle: "India job board" },
};

type CredentialState = { email: string; password: string; showPw: boolean; verifyStatus: VerifyStatus; verifyMsg: string };
const blankCred = (): CredentialState => ({ email:"", password:"", showPw:false, verifyStatus:"idle", verifyMsg:"" });

export default function SettingsPage() {
  useAuth();

  const [userEmail, setUserEmail] = useState("");
  const [token, setToken]         = useState("");
  const [active, setActive]       = useState<Section>("profile");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");
  const [planPlatforms, setPlanPlatforms] = useState<string[]>([]);

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

  // Screening defaults
  const [yearsExp, setYearsExp]         = useState("2");
  const [salary, setSalary]             = useState("800000");
  const [noticePeriod, setNoticePeriod] = useState("30");

  // Credentials map: platform → state
  const [creds, setCreds] = useState<Record<string, CredentialState>>({});

  const setCredField = (platform: string, field: keyof CredentialState, value: string | boolean) =>
    setCreds(prev => ({ ...prev, [platform]: { ...prev[platform], [field]: value } }));

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    const tok    = localStorage.getItem("token") ?? "";
    if (!stored) return;
    const u = JSON.parse(stored);
    setUserEmail(u.email);
    setToken(tok);
    setName(u.name ?? "");

    const hdrs = { Authorization: `Bearer ${tok}` };

    // Load plan / platforms
    fetch(`${API}/api/billing/plan/${encodeURIComponent(u.email)}`, { headers: hdrs })
      .then(r => r.ok ? r.json() : null)
      .then(p => { if (p?.platforms) setPlanPlatforms(p.platforms); })
      .catch(() => setPlanPlatforms(["linkedin"]));

    // Load profile + credentials
    fetch(`${API}/api/profile/${encodeURIComponent(u.email)}`, { headers: hdrs })
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (!p) return;
        setPhone(p.phone ?? "");
        setTargetTitles((p.target_titles ?? []).join(", "));
        setTargetLocations((p.target_locations ?? []).join("\n"));
        setSkills((p.skills ?? []).join(", "));
        if (p.cv_path) setCvName(p.cv_path.split("/").pop() ?? "");

        // Populate credential state for all platforms
        const init: Record<string, CredentialState> = {};
        for (const plat of Object.keys(PLATFORM_META)) {
          init[plat] = {
            email:        p[`${plat}_email`]    ?? "",
            password:     "",  // never returned from API for security
            showPw:       false,
            verifyStatus: p[`${plat}_verified`] ? "ok" : "idle",
            verifyMsg:    p[`${plat}_verified`] ? "Verified" : "",
          };
        }
        setCreds(init);
      })
      .catch(() => {});
  }, []);

  async function verify(platform: string) {
    const c = creds[platform];
    if (!c?.email || !c?.password) return;
    setCredField(platform, "verifyStatus", "checking");
    setCredField(platform, "verifyMsg", "Checking credentials…");
    try {
      const res = await fetch(`${API}/api/bot/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform, email: c.email, password: c.password }),
      });
      const data = await res.json();
      setCredField(platform, "verifyStatus", data.ok ? "ok" : "fail");
      setCredField(platform, "verifyMsg", data.message ?? (data.ok ? "Verified" : "Failed"));
      if (data.ok) await saveCredentials().catch(() => {});
    } catch {
      setCredField(platform, "verifyStatus", "fail");
      setCredField(platform, "verifyMsg", "Could not connect to server");
    }
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
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    if (!res.ok) throw new Error((await res.json()).detail ?? "Profile save failed");
    const p = await res.json();
    const stored = JSON.parse(localStorage.getItem("jobrocket_user") ?? "{}");
    localStorage.setItem("jobrocket_user", JSON.stringify({ ...stored, ...p }));
  }

  async function saveCredentials() {
    const body: Record<string, string> = {};
    for (const [plat, c] of Object.entries(creds)) {
      if (c.email)    body[`${plat}_email`]    = c.email;
      if (c.password) body[`${plat}_password`] = c.password;
    }
    const res = await fetch(`${API}/api/profile/${encodeURIComponent(userEmail)}/credentials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).detail ?? "Save failed");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    try {
      if (active === "profile" || active === "cv") await saveProfile();
      else if (active === "platforms") await saveCredentials();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving");
    } finally {
      setSaving(false);
    }
  }

  const TAB = (id: Section, label: string) => (
    <button type="button" onClick={() => setActive(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
        active === id ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 h-14 flex items-center px-6 gap-4 sticky top-0 z-10">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 text-sm transition">← Dashboard</Link>
        <h1 className="text-base font-semibold text-gray-900">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-8">
        <div className="flex gap-2 mb-6 bg-white border border-gray-100 rounded-xl p-1.5 overflow-x-auto">
          {TAB("profile",   "Profile")}
          {TAB("cv",        "CV Upload")}
          {TAB("platforms", "Platforms")}
          {TAB("screening", "Screening")}
        </div>

        <form onSubmit={handleSave} className="space-y-5">

          {/* ── PROFILE ── */}
          {active === "profile" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Your profile</h2>
              <p className="text-xs text-gray-400 -mt-1">Used to fill your name, phone, and tailor applications.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LBL}>Full name</label>
                  <input value={name} onChange={e => setName(e.target.value)} required className={INPUT} placeholder="Your name" />
                </div>
                <div>
                  <label className={LBL}>Phone number</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} placeholder="+91 9876543210" />
                </div>
              </div>
              <div>
                <label className={LBL}>Target job titles <span className="text-gray-300">(comma-separated)</span></label>
                <input value={targetTitles} onChange={e => setTargetTitles(e.target.value)} className={INPUT}
                  placeholder="React Developer, Frontend Engineer" />
              </div>
              <div>
                <label className={LBL}>Target locations <span className="text-gray-300">(one per line)</span></label>
                <textarea value={targetLocations} onChange={e => setTargetLocations(e.target.value)}
                  rows={4} className={INPUT + " resize-none"}
                  placeholder={"Doha, Qatar\nDubai, UAE\nRemote"} />
                <p className="text-xs text-gray-400 mt-1">One location per line. "City, Country" format works best.</p>
              </div>
              <div>
                <label className={LBL}>Skills <span className="text-gray-300">(comma-separated)</span></label>
                <input value={skills} onChange={e => setSkills(e.target.value)} className={INPUT}
                  placeholder="React, TypeScript, Node.js" />
              </div>
            </div>
          )}

          {/* ── CV ── */}
          {active === "cv" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Upload your CV</h2>
              <p className="text-xs text-gray-400 -mt-1">PDF only. The bot attaches this to every application.</p>
              <div onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition
                  ${cvFile || cvName ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"}`}>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setCvFile(f); setCvName(f.name); } }} />
                {cvFile || cvName ? (
                  <><div className="text-3xl mb-2">📄</div>
                  <p className="text-sm font-medium text-indigo-700">{cvName}</p>
                  <p className="text-xs text-indigo-400 mt-1">Click to replace</p></>
                ) : (
                  <><div className="text-3xl mb-2">☁️</div>
                  <p className="text-sm font-medium text-gray-700">Click to upload your CV</p>
                  <p className="text-xs text-gray-400 mt-1">PDF · Max 10MB</p></>
                )}
              </div>
            </div>
          )}

          {/* ── PLATFORMS ── */}
          {active === "platforms" && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-sm text-indigo-800">
                Add credentials for each job platform. The bot will only run platforms marked <strong>Verified</strong>.
              </div>
              {planPlatforms.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">Loading your plan platforms…</p>
              )}
              {planPlatforms.map(plat => {
                const meta = PLATFORM_META[plat];
                if (!meta) return null;
                const c = creds[plat] ?? blankCred();
                const badge = {
                  idle:     { cls: "bg-gray-100 text-gray-500",   icon: "○", text: "Not verified" },
                  checking: { cls: "bg-yellow-50 text-yellow-600", icon: "⟳", text: "Checking…" },
                  ok:       { cls: "bg-green-50 text-green-700",   icon: "✓", text: c.verifyMsg || "Verified" },
                  fail:     { cls: "bg-red-50 text-red-600",       icon: "✕", text: c.verifyMsg || "Failed" },
                }[c.verifyStatus];

                return (
                  <div key={plat} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded ${meta.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {meta.abbr}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm">{meta.label}</h3>
                        <p className="text-xs text-gray-400">{meta.subtitle}</p>
                      </div>
                      <span className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${badge.cls}`}>
                        <span>{badge.icon}</span> {badge.text}
                      </span>
                    </div>

                    <div>
                      <label className={LBL}>Email</label>
                      <input type="email" value={c.email}
                        onChange={e => setCredField(plat, "email", e.target.value)}
                        className={INPUT} placeholder={`your@email.com`} />
                    </div>

                    <div>
                      <label className={LBL}>Password</label>
                      <div className="relative">
                        <input type={c.showPw ? "text" : "password"} value={c.password}
                          onChange={e => setCredField(plat, "password", e.target.value)}
                          className={INPUT + " pr-14"} placeholder="••••••••" />
                        <button type="button" onClick={() => setCredField(plat, "showPw", !c.showPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700">
                          {c.showPw ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    {c.verifyStatus === "fail" && (
                      <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">
                        {c.verifyMsg}
                      </div>
                    )}

                    {["linkedin","indeed","glassdoor"].includes(plat) && (
                      <button type="button" onClick={() => verify(plat)}
                        disabled={!c.email || !c.password || c.verifyStatus === "checking"}
                        className="w-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium py-2.5 rounded-xl transition text-sm">
                        {c.verifyStatus === "checking" ? "Verifying account…" : `Verify ${meta.label} account`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SCREENING ── */}
          {active === "screening" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Screening question defaults</h2>
              <p className="text-xs text-gray-400 -mt-1">Used to auto-answer common application questions.</p>
              <div>
                <label className={LBL}>Years of experience</label>
                <input type="number" min="0" max="40" value={yearsExp}
                  onChange={e => setYearsExp(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LBL}>Expected salary (₹ per year)</label>
                <input type="number" value={salary}
                  onChange={e => setSalary(e.target.value)} className={INPUT} placeholder="800000" />
                <p className="text-xs text-gray-400 mt-1">e.g. 800000 = ₹8 LPA</p>
              </div>
              <div>
                <label className={LBL}>Notice period (days)</label>
                <input type="number" min="0" value={noticePeriod}
                  onChange={e => setNoticePeriod(e.target.value)} className={INPUT} placeholder="30" />
              </div>
              <p className="text-xs text-gray-400">These values are used to fill form fields automatically during job applications.</p>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
          )}

          <button type="submit" disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition text-sm">
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

const INPUT = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 transition bg-white";
const LBL   = "block text-xs font-medium text-gray-500 mb-1.5";
