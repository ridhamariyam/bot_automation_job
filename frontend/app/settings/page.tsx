"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL as string;
type Section = "profile" | "platforms" | "defaults" | "cv";
type VerifyStatus = "idle" | "checking" | "ok" | "fail";

interface UserPlanInfo {
  plan: string;
  platforms: string[];
}

export default function SettingsPage() {
  useAuth();

  const [userEmail, setUserEmail] = useState("");
  const [token, setToken]         = useState("");
  const [active, setActive]       = useState<Section>("profile");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState("");
  const [planInfo, setPlanInfo]   = useState<UserPlanInfo | null>(null);

  // Profile
  const [name, setName]                       = useState("");
  const [phone, setPhone]                     = useState("");
  const [targetTitles, setTargetTitles]       = useState("");
  const [targetLocations, setTargetLocations] = useState("");
  const [skills, setSkills]                   = useState("");

  // Platform credentials
  const [liEmail, setLiEmail]       = useState("");
  const [liPassword, setLiPassword] = useState("");
  const [inEmail, setInEmail]       = useState("");
  const [inPassword, setInPassword] = useState("");
  const [showLiPw, setShowLiPw]     = useState(false);
  const [showInPw, setShowInPw]     = useState(false);

  // Verify status per platform
  const [liVerify, setLiVerify]     = useState<VerifyStatus>("idle");
  const [liVerifyMsg, setLiVerifyMsg] = useState("");
  const [inVerify, setInVerify]     = useState<VerifyStatus>("idle");
  const [inVerifyMsg, setInVerifyMsg] = useState("");

  // Screening
  const [yearsExp, setYearsExp]         = useState("2");
  const [salary, setSalary]             = useState("800000");
  const [noticePeriod, setNoticePeriod] = useState("30");

  // CV
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvName, setCvName] = useState("");
  const fileRef             = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    const tok    = localStorage.getItem("token") ?? "";
    if (!stored) return;
    const u = JSON.parse(stored);
    setUserEmail(u.email);
    setToken(tok);
    setName(u.name ?? "");

    // Fetch plan info
    fetch(`${API}/api/billing/plan/${encodeURIComponent(u.email)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (p) {
          setPlanInfo({ plan: p.plan, platforms: p.platforms || [] });
        }
      })
      .catch(() => {});

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
        setLiEmail(p.linkedin_email ?? "");
        setLiPassword(p.linkedin_password ?? "");
        setInEmail(p.indeed_email ?? "");
        setInPassword(p.indeed_password ?? "");
        setYearsExp(p.years_experience ?? "2");
        setSalary(p.expected_salary ?? "800000");
        setNoticePeriod(p.notice_period ?? "30");
        if (p.cv_path) setCvName(p.cv_path.split("/").pop() ?? "");
        if (p.linkedin_verified) { setLiVerify("ok"); setLiVerifyMsg("Account verified"); }
        if (p.indeed_verified)   { setInVerify("ok"); setInVerifyMsg("Account verified"); }
      })
      .catch(() => {});
  }, []);

  async function verify(platform: "linkedin" | "indeed") {
    const email    = platform === "linkedin" ? liEmail : inEmail;
    const password = platform === "linkedin" ? liPassword : inPassword;
    if (!email || !password) return;

    const setStatus = platform === "linkedin" ? setLiVerify : setInVerify;
    const setMsg    = platform === "linkedin" ? setLiVerifyMsg : setInVerifyMsg;

    setStatus("checking");
    setMsg("Checking credentials…");

    try {
      const res = await fetch(`${API}/api/bot/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform, email, password }),
      });
      const data = await res.json();
      setStatus(data.ok ? "ok" : "fail");
      setMsg(data.message ?? (data.ok ? "Verified" : "Failed"));
      // Auto-save credentials after successful verification
      if (data.ok) await saveCredentials().catch(() => {});
    } catch {
      setStatus("fail");
      setMsg("Could not connect to server");
    }
  }

  async function saveProfile() {
    const fd = new FormData();
    fd.append("name", name); fd.append("email", userEmail);
    fd.append("phone", phone); fd.append("summary", "");
    fd.append("skills", skills); fd.append("targetTitles", targetTitles);
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
    const res = await fetch(`${API}/api/profile/${encodeURIComponent(userEmail)}/credentials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        linkedin_email: liEmail, linkedin_password: liPassword,
        indeed_email: inEmail,   indeed_password: inPassword,
        years_experience: yearsExp, expected_salary: salary, notice_period: noticePeriod,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).detail ?? "Save failed");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    try {
      if (active === "profile" || active === "cv") await saveProfile();
      else await saveCredentials();
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
        <div className="flex gap-2 mb-6 bg-white border border-gray-100 rounded-xl p-1.5">
          {TAB("profile", "Profile")}
          {TAB("cv", "CV Upload")}
          {TAB("platforms", "Platforms")}
          {TAB("defaults", "Screening")}
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
                <input value={targetTitles} onChange={e => setTargetTitles(e.target.value)} className={INPUT} placeholder="React Developer, Frontend Engineer" />
              </div>
              <div>
                <label className={LBL}>Target locations <span className="text-gray-300">(one per line)</span></label>
                <textarea
                  value={targetLocations}
                  onChange={e => setTargetLocations(e.target.value)}
                  rows={4}
                  className={INPUT + " resize-none"}
                  placeholder={"Doha, Qatar\nDubai, UAE\nRemote"}
                />
                <p className="text-xs text-gray-400 mt-1">Enter each location on a new line. City, Country format works perfectly.</p>
              </div>
              <div>
                <label className={LBL}>Skills <span className="text-gray-300">(comma-separated)</span></label>
                <input value={skills} onChange={e => setSkills(e.target.value)} className={INPUT} placeholder="React, TypeScript, Node.js" />
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
            <div className="space-y-5">
              {!planInfo ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-500">
                  Loading plan information…
                </div>
              ) : (
                <>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
                    <div className="text-lg mt-0.5">📋</div>
                    <div>
                      <p className="text-sm font-medium text-indigo-900">Your plan: <span className="capitalize font-bold">{planInfo.plan}</span></p>
                      <p className="text-xs text-indigo-700 mt-1">
                        Available platforms: {planInfo.platforms.join(", ") || "None"}
                      </p>
                      {planInfo.plan === "free" && (
                        <Link href="/billing" className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold mt-2 inline-block">
                          Upgrade for more platforms →
                        </Link>
                      )}
                    </div>
                  </div>

                  {planInfo.platforms.includes("linkedin") && (
                    <PlatformCard
                      logo="in" logoColor="bg-[#0077B5]"
                      name="LinkedIn" subtitle="Easy Apply jobs"
                      email={liEmail}       onEmail={setLiEmail}
                      password={liPassword} onPassword={setLiPassword}
                      showPw={showLiPw}     onTogglePw={() => setShowLiPw(v => !v)}
                      verifyStatus={liVerify} verifyMsg={liVerifyMsg}
                      onVerify={() => verify("linkedin")}
                    />
                  )}

                  {planInfo.platforms.includes("indeed") && (
                    <PlatformCard
                      logo="II" logoColor="bg-[#003A9B]"
                      name="Indeed" subtitle="Apply on Indeed jobs"
                      email={inEmail}       onEmail={setInEmail}
                      password={inPassword} onPassword={setInPassword}
                      showPw={showInPw}     onTogglePw={() => setShowInPw(v => !v)}
                      verifyStatus={inVerify} verifyMsg={inVerifyMsg}
                      onVerify={() => verify("indeed")}
                    />
                  )}

                  {!planInfo.platforms.includes("indeed") && planInfo.plan !== "free" && (
                    <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6 text-center">
                      <p className="text-sm text-gray-600">More platforms coming soon for your plan!</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── SCREENING ── */}
          {active === "defaults" && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Screening question defaults</h2>
              <p className="text-xs text-gray-400 -mt-1">Used to auto-answer common application questions.</p>
              <div>
                <label className={LBL}>Years of experience</label>
                <input type="number" min="0" max="40" value={yearsExp} onChange={e => setYearsExp(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={LBL}>Expected salary (₹ per year)</label>
                <input type="number" value={salary} onChange={e => setSalary(e.target.value)} className={INPUT} placeholder="800000" />
                <p className="text-xs text-gray-400 mt-1">e.g. 800000 = ₹8 LPA</p>
              </div>
              <div>
                <label className={LBL}>Notice period (days)</label>
                <input type="number" min="0" value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} className={INPUT} placeholder="30" />
              </div>
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

/* ── Platform card with verify button ── */
function PlatformCard({
  logo, logoColor, name, subtitle,
  email, onEmail, password, onPassword, showPw, onTogglePw,
  verifyStatus, verifyMsg, onVerify,
}: {
  logo: string; logoColor: string; name: string; subtitle: string;
  email: string; onEmail: (v: string) => void;
  password: string; onPassword: (v: string) => void;
  showPw: boolean; onTogglePw: () => void;
  verifyStatus: VerifyStatus; verifyMsg: string;
  onVerify: () => void;
}) {
  const badge = {
    idle:     { cls: "bg-gray-100 text-gray-500",   icon: "○", text: "Not verified" },
    checking: { cls: "bg-yellow-50 text-yellow-600", icon: "⟳", text: "Checking…" },
    ok:       { cls: "bg-green-50 text-green-700",   icon: "✓", text: verifyMsg || "Verified" },
    fail:     { cls: "bg-red-50 text-red-600",       icon: "✕", text: verifyMsg || "Failed" },
  }[verifyStatus];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded ${logoColor} flex items-center justify-center text-white text-xs font-bold`}>{logo}</div>
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">{name}</h2>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        <span className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>
          <span>{badge.icon}</span> {badge.text}
        </span>
      </div>

      <div>
        <label className={LBL}>Email</label>
        <input type="email" value={email} onChange={e => onEmail(e.target.value)} className={INPUT} placeholder={`your@${name.toLowerCase()}.com`} />
      </div>

      <div>
        <label className={LBL}>Password</label>
        <div className="relative">
          <input type={showPw ? "text" : "password"} value={password} onChange={e => onPassword(e.target.value)}
            className={INPUT + " pr-14"} placeholder="••••••••" />
          <button type="button" onClick={onTogglePw}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-700">
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {verifyStatus === "fail" && (
        <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">
          {verifyMsg}
        </div>
      )}

      <button type="button" onClick={onVerify}
        disabled={!email || !password || verifyStatus === "checking"}
        className="w-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium py-2.5 rounded-xl transition text-sm">
        {verifyStatus === "checking" ? "Verifying account…" : `Verify ${name} account`}
      </button>

      <p className="text-xs text-gray-400">Credentials are stored locally on this machine only.</p>
    </div>
  );
}

const INPUT = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 transition bg-white";
const LBL   = "block text-xs font-medium text-gray-500 mb-1.5";
