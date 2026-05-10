"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/useAuth";
import { Zap, Upload, Check, ArrowRight, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PLATFORMS = [
  { id: "linkedin",  label: "LinkedIn",  desc: "Easy Apply automation" },
  { id: "indeed",    label: "Indeed",    desc: "Quick Apply automation" },
  { id: "glassdoor", label: "Glassdoor", desc: "One-click apply" },
  { id: "monster",   label: "Monster",   desc: "Direct applications" },
];

const WORK_MODES  = ["remote", "hybrid", "onsite"];
const JOB_TYPES   = ["full-time", "part-time", "contract", "internship"];
const EXP_LEVELS  = ["fresher", "junior", "mid", "senior", "lead"];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-300 ${
            i < current ? "bg-indigo-600 w-6" : i === current ? "bg-indigo-400 w-4" : "bg-slate-200 w-4"
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — Resume upload
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Step 2 — Profile (auto-filled from CV or manual)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState("");
  const [titles, setTitles] = useState("");
  const [locations, setLocations] = useState("");

  // Step 3 — Preferences
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [workModes, setWorkModes] = useState<string[]>(["remote", "hybrid"]);
  const [jobTypes, setJobTypes] = useState<string[]>(["full-time"]);
  const [expLevel, setExpLevel] = useState("mid");

  // Pre-fill name from auth
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("jobrocket_user") : null;
    if (raw) {
      try { setName(JSON.parse(raw).name ?? ""); } catch { /* ignore */ }
    }
  }, []);

  function toggleItem<T extends string>(list: T[], item: T, setList: (v: T[]) => void) {
    setList(list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
  }

  const handleFileUpload = useCallback(async (file: File) => {
    setCvFile(file);
    const token = localStorage.getItem("token") ?? "";
    const user = JSON.parse(localStorage.getItem("jobrocket_user") ?? "{}");
    const fd = new FormData();
    fd.append("cv", file);
    fd.append("email", user.email ?? "");
    fd.append("name", user.name ?? name);
    try {
      const res = await fetch(`${API}/api/profile/cv-extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.skills)    setSkills(data.skills);
        if (data.phone)     setPhone(data.phone);
        if (data.titles)    setTitles(data.titles);
        if (data.locations) setLocations(data.locations);
      }
    } catch { /* CV extraction is best-effort */ }
  }, [name]);

  async function handleFinish() {
    setSaving(true);
    setError("");
    const token = localStorage.getItem("token") ?? "";
    const user = JSON.parse(localStorage.getItem("jobrocket_user") ?? "{}");

    try {
      const fd = new FormData();
      fd.append("email", user.email ?? "");
      fd.append("name", name || user.name || "");
      fd.append("phone", phone);
      fd.append("skills", skills);
      fd.append("targetTitles", titles);
      fd.append("targetLocations", locations);
      if (cvFile) fd.append("cv", cvFile);

      const profileRes = await fetch(`${API}/api/profile`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!profileRes.ok) throw new Error("Failed to save profile");

      // Save preferences
      const prefsRes = await fetch(`${API}/api/profile/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: user.email,
          platforms,
          filters: { jobTypes, workModes, experienceLevel: expLevel, companySizes: [] },
        }),
      });
      if (!prefsRes.ok) throw new Error("Failed to save preferences");

      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const dropHandler = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "application/pdf" || file.name.endsWith(".pdf"))) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Nav */}
      <nav className="bg-white border-b border-slate-100 px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={13} className="text-white" fill="white" />
          </div>
          <span className="text-[15px] font-semibold text-slate-900">JobRocket</span>
        </div>
        <StepIndicator current={step} total={3} />
      </nav>

      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait">

            {/* ── STEP 0: Resume Upload ── */}
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <p className="caption text-indigo-600 mb-3">Step 1 of 3</p>
                <h1 className="heading-2 text-slate-900 mb-2">Start with your resume</h1>
                <p className="body-sm text-slate-500 mb-7">
                  Upload your CV and AI will auto-fill your skills, titles, and location preferences. You can edit everything in the next step.
                </p>

                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={dropHandler}
                  className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
                    dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  {cvFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                        <Check size={20} className="text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-slate-900">{cvFile.name}</p>
                        <p className="text-[12px] text-slate-500 mt-0.5">AI is extracting your profile…</p>
                      </div>
                      <button
                        onClick={() => setCvFile(null)}
                        className="flex items-center gap-1 text-[12px] text-slate-400 hover:text-slate-600 transition"
                      >
                        <X size={12} /> Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <Upload size={20} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-slate-700">Drop your PDF here</p>
                        <p className="text-[12px] text-slate-400 mt-0.5">or click to browse</p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="w-full h-11 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {cvFile ? "Continue" : "Continue without resume"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 1: Profile ── */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <p className="caption text-indigo-600 mb-3">Step 2 of 3</p>
                <h1 className="heading-2 text-slate-900 mb-2">Confirm your profile</h1>
                <p className="body-sm text-slate-500 mb-7">
                  {cvFile ? "We extracted this from your CV — edit anything that looks wrong." : "Fill in your details to help the bot find the right jobs."}
                </p>

                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Full name</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Phone (optional)</label>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1 555 000 0000"
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Skills <span className="text-slate-400 font-normal">(comma-separated)</span></label>
                    <textarea
                      value={skills}
                      onChange={(e) => setSkills(e.target.value)}
                      placeholder="React, TypeScript, Node.js, Python, AWS…"
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Target job titles <span className="text-slate-400 font-normal">(comma-separated)</span></label>
                    <input
                      value={titles}
                      onChange={(e) => setTitles(e.target.value)}
                      placeholder="Software Engineer, Frontend Developer…"
                      className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Target locations <span className="text-slate-400 font-normal">(one per line)</span></label>
                    <textarea
                      value={locations}
                      onChange={(e) => setLocations(e.target.value)}
                      placeholder="Remote&#10;New York, NY&#10;London, UK"
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-[13.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setStep(0)}
                    className="px-5 h-11 rounded-xl text-[13.5px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!name.trim() || !titles.trim()}
                    className="flex-1 h-11 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    Continue <ArrowRight size={15} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Preferences ── */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                <p className="caption text-indigo-600 mb-3">Step 3 of 3</p>
                <h1 className="heading-2 text-slate-900 mb-2">Set your preferences</h1>
                <p className="body-sm text-slate-500 mb-7">
                  The bot only applies to jobs matching these filters.
                </p>

                {error && (
                  <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-[13px] text-red-700">
                    {error}
                  </div>
                )}

                <div className="space-y-6">
                  {/* Platforms */}
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-3">Job platforms</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {PLATFORMS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => toggleItem(platforms, p.id, setPlatforms)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                            platforms.includes(p.id)
                              ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                            platforms.includes(p.id) ? "bg-indigo-600 border-indigo-600" : "border-slate-300"
                          }`}>
                            {platforms.includes(p.id) && <Check size={10} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold">{p.label}</p>
                            <p className="text-[11px] text-slate-500">{p.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Work mode */}
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-3">Work mode</label>
                    <div className="flex flex-wrap gap-2">
                      {WORK_MODES.map(m => (
                        <button
                          key={m}
                          onClick={() => toggleItem(workModes, m, setWorkModes)}
                          className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors capitalize ${
                            workModes.includes(m)
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Job type */}
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-3">Job type</label>
                    <div className="flex flex-wrap gap-2">
                      {JOB_TYPES.map(t => (
                        <button
                          key={t}
                          onClick={() => toggleItem(jobTypes, t, setJobTypes)}
                          className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors ${
                            jobTypes.includes(t)
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {t.replace("-", " ").replace(/^\w/, c => c.toUpperCase())}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Experience level */}
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-3">Experience level</label>
                    <div className="flex flex-wrap gap-2">
                      {EXP_LEVELS.map(l => (
                        <button
                          key={l}
                          onClick={() => setExpLevel(l)}
                          className={`px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors capitalize ${
                            expLevel === l
                              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="px-5 h-11 rounded-xl text-[13.5px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={saving || platforms.length === 0}
                    className="flex-1 h-11 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? "Setting up…" : "Go to dashboard"}
                    {!saving && <ArrowRight size={15} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
