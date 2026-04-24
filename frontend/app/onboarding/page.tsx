"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL as string;

export default function OnboardingPage() {
  useAuth();
  const router = useRouter();

  const [step, setStep]           = useState(1);
  const [userEmail, setUserEmail] = useState("");
  const [token, setToken]         = useState("");

  // Step 1: Profile
  const [name, setName]           = useState("");
  const [phone, setPhone]         = useState("");
  const [titles, setTitles]       = useState("");
  const [locations, setLocations] = useState("");
  const [skills, setSkills]       = useState("");

  // Step 2: platform connect
  const [connectOpen, setConnectOpen]   = useState(false);
  const [liEmail, setLiEmail]           = useState("");
  const [liPassword, setLiPassword]     = useState("");
  const [verifying, setVerifying]       = useState(false);
  const [verifyMsg, setVerifyMsg]       = useState("");
  const [verifyOk, setVerifyOk]         = useState(false);
  const [liVerified, setLiVerified]     = useState(false);

  // Step 3: CV
  const [cvFile, setCvFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("jobrocket_user");
    const tok    = localStorage.getItem("token") ?? "";
    if (!stored) { router.push("/login"); return; }
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
        if (p.name)             setName(p.name);
        if (p.phone)            setPhone(p.phone);
        if (p.target_titles)    setTitles(p.target_titles.join(", "));
        if (p.target_locations) setLocations(p.target_locations.join("\n"));
        if (p.skills)           setSkills(p.skills.join(", "));
        if (p.linkedin_email) {
          setLiEmail(p.linkedin_email);
          if (p.linkedin_verified) setLiVerified(true);
        }
      })
      .catch(() => {});
  }, [router]);

  function openLinkedIn() {
    window.open("https://www.linkedin.com/login", "_blank", "noopener,noreferrer");
    setConnectOpen(true);
    setVerifyMsg("");
    setVerifyOk(false);
  }

  async function verifyLinkedIn() {
    if (!liEmail || !liPassword) {
      setVerifyMsg("Enter the same email and password you just used on LinkedIn.");
      return;
    }
    setVerifying(true);
    setVerifyMsg("Verifying with LinkedIn…");
    try {
      const res  = await fetch(`${API}/api/bot/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform: "linkedin", email: liEmail, password: liPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        setVerifyOk(true);
        setLiVerified(true);
        setVerifyMsg("✓ LinkedIn connected successfully!");
      } else {
        setVerifyOk(false);
        setVerifyMsg(data.message || "Could not verify. Check credentials and try again.");
      }
    } catch {
      setVerifyMsg("Connection error — please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function saveAndContinue() {
    if (step === 1 && (!name || !titles || !locations)) {
      setError("Please fill in name, job titles, and locations."); return;
    }
    if (step === 2 && !liVerified) {
      setError("Please connect LinkedIn before continuing."); return;
    }

    setSaving(true); setError("");
    try {
      const tok = localStorage.getItem("token") ?? "";

      if (step === 1) {
        const fd = new FormData();
        fd.append("name", name); fd.append("email", userEmail);
        fd.append("phone", phone); fd.append("skills", skills);
        fd.append("targetTitles", titles); fd.append("targetLocations", locations);
        const res = await fetch(`${API}/api/profile`, {
          method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd,
        });
        if (!res.ok) throw new Error("Failed to save profile");
      }

      if (step === 2) {
        const res = await fetch(`${API}/api/profile/${encodeURIComponent(userEmail)}/credentials`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
          body: JSON.stringify({ linkedin_email: liEmail, linkedin_password: liPassword }),
        });
        if (!res.ok) throw new Error("Failed to save credentials");
      }

      if (step === 3) {
        const fd = new FormData();
        fd.append("name", name); fd.append("email", userEmail);
        fd.append("phone", phone); fd.append("skills", skills);
        fd.append("targetTitles", titles); fd.append("targetLocations", locations);
        if (cvFile) fd.append("cv", cvFile);
        const res = await fetch(`${API}/api/profile`, {
          method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: fd,
        });
        if (!res.ok) throw new Error("Failed to save CV");
      }

      setSaving(false);
      if (step < 4) setStep(step + 1);
      else router.push("/dashboard");
    } catch (err) {
      setError(`Error: ${err}`);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <nav className="border-b border-white/5 h-14 flex items-center px-6">
        <span className="text-base font-bold tracking-tight">
          <span className="text-indigo-400">Job</span>Rocket
        </span>
      </nav>

      <div className="flex-1 flex items-start justify-center px-5 py-12">
        <div className="w-full max-w-lg">

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 mb-10">
            {["Profile", "Connect", "CV", "Ready"].map((label, i) => {
              const s = i + 1;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                    s === step ? "bg-indigo-600 text-white" :
                    s < step   ? "bg-indigo-600/20 text-indigo-400" :
                                 "bg-white/5 text-white/30"
                  }`}>
                    {s < step ? "✓ " : ""}{label}
                  </div>
                  {s < 4 && <div className={`w-6 h-px ${s < step ? "bg-indigo-500/50" : "bg-white/10"}`} />}
                </div>
              );
            })}
          </div>

          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-8">

            {/* ── STEP 1: Profile ── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Tell us about yourself</h2>
                  <p className="text-sm text-white/40">This is used to fill out job applications automatically.</p>
                </div>
                {[
                  { label: "Full name",                  val: name,      set: setName,      ph: "Jane Doe",                         type: "text" },
                  { label: "Phone",                      val: phone,     set: setPhone,     ph: "+91 9876543210",                   type: "tel" },
                  { label: "Target job titles (comma-separated)", val: titles,    set: setTitles,    ph: "Frontend Engineer, React Developer", type: "text" },
                  { label: "Key skills (comma-separated)",        val: skills,    set: setSkills,    ph: "React, TypeScript, Node.js",        type: "text" },
                ].map(({ label, val, set, ph, type }) => (
                  <div key={label}>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">{label}</label>
                    <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                      className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 transition" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Target locations (one per line)</label>
                  <textarea value={locations} onChange={e => setLocations(e.target.value)} rows={3} placeholder={"Dubai, UAE\nLondon, UK\nRemote"}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 transition resize-none" />
                </div>
              </div>
            )}

            {/* ── STEP 2: Connect platforms ── */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Connect LinkedIn</h2>
                  <p className="text-sm text-white/40">The bot applies to jobs on your behalf using your LinkedIn account.</p>
                </div>

                {liVerified ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                    <span className="text-green-400 text-xl">✓</span>
                    <div>
                      <p className="text-sm font-medium text-green-400">LinkedIn connected</p>
                      <p className="text-xs text-white/40">{liEmail}</p>
                    </div>
                    <button onClick={() => { setLiVerified(false); setConnectOpen(false); setLiPassword(""); }}
                      className="ml-auto text-xs text-white/30 hover:text-white/60 transition">Change</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* External link first */}
                    <button onClick={openLinkedIn}
                      className="w-full flex items-center justify-center gap-2.5 border border-[#0077B5]/60 text-[#4da6d4] hover:bg-[#0077B5]/10 font-medium py-3 rounded-xl transition text-sm">
                      <span className="w-6 h-6 rounded bg-[#0077B5] flex items-center justify-center text-white text-xs font-bold shrink-0">in</span>
                      Open LinkedIn to log in
                      <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>

                    {connectOpen && (
                      <div className="border border-white/10 rounded-xl p-4 space-y-3 bg-white/[0.02]">
                        <p className="text-xs text-white/50">
                          After logging in to LinkedIn, enter the same credentials below to authorize the bot:
                        </p>
                        <div>
                          <label className="block text-xs font-medium text-white/40 mb-1">LinkedIn email</label>
                          <input type="email" value={liEmail} onChange={e => setLiEmail(e.target.value)}
                            placeholder="you@email.com" autoFocus
                            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 transition" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/40 mb-1">LinkedIn password</label>
                          <input type="password" value={liPassword} onChange={e => setLiPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/60 transition" />
                        </div>

                        {verifyMsg && (
                          <p className={`text-xs ${verifyOk ? "text-green-400" : "text-red-400"}`}>{verifyMsg}</p>
                        )}

                        <button onClick={verifyLinkedIn} disabled={verifying || !liEmail || !liPassword}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition text-sm">
                          {verifying ? "Verifying…" : "Authorize bot →"}
                        </button>

                        <p className="text-[11px] text-white/25 text-center">
                          🔒 Credentials are encrypted with AES-256 and only used for job automation.
                        </p>
                      </div>
                    )}

                    {!connectOpen && (
                      <p className="text-xs text-white/30 text-center">
                        Click "Open LinkedIn" above first, then return here to authorize.
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-white/5">
                  <p className="text-xs text-white/30">More platforms (Indeed, Glassdoor, Monster) can be added in Settings after setup.</p>
                </div>
              </div>
            )}

            {/* ── STEP 3: CV ── */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Upload your CV</h2>
                  <p className="text-sm text-white/40">Attached to every application. You can skip and add it later in Settings.</p>
                </div>
                <label htmlFor="cv-upload" className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
                  ${cvFile ? "border-indigo-500/50 bg-indigo-600/5" : "border-white/10 hover:border-white/20"}`}>
                  <input type="file" id="cv-upload" accept=".pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setCvFile(f); }} />
                  <p className="text-3xl mb-2">{cvFile ? "📄" : "☁️"}</p>
                  <p className="text-sm font-medium text-white/70">{cvFile ? cvFile.name : "Click to upload your CV"}</p>
                  <p className="text-xs text-white/30 mt-1">{cvFile ? "Click to replace" : "PDF · Max 10MB"}</p>
                </label>
              </div>
            )}

            {/* ── STEP 4: Ready ── */}
            {step === 4 && (
              <div className="space-y-5 text-center">
                <div className="w-16 h-16 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-3xl mx-auto">
                  🚀
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">You're all set!</h2>
                  <p className="text-sm text-white/40">Your bot is ready to start applying.</p>
                </div>
                <div className="text-left space-y-2 bg-white/[0.03] rounded-xl p-5 border border-white/8">
                  {[
                    ["Name",         name],
                    ["Job titles",   titles],
                    ["LinkedIn",     liEmail || "—"],
                    ["CV",           cvFile ? cvFile.name : "Not uploaded (can add in Settings)"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start gap-3 text-sm">
                      <span className="text-white/30 w-24 shrink-0">{k}</span>
                      <span className="text-white/70 break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 mt-4">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)}
                className="flex-1 border border-white/10 hover:border-white/20 text-white/60 hover:text-white font-medium py-3 rounded-xl transition text-sm">
                ← Back
              </button>
            )}
            <button onClick={saveAndContinue} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition text-sm">
              {saving ? "Saving…" :
               step === 4 ? "Go to dashboard →" :
               step === 2 && !liVerified ? "Skip for now →" :
               step === 3 ? "Next (skip CV)" : "Next →"}
            </button>
          </div>

          {step === 2 && !liVerified && (
            <p className="text-center text-xs text-white/25 mt-3">You can connect platforms later in Settings.</p>
          )}
        </div>
      </div>
    </div>
  );
}
